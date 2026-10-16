/**
 * POST /api/scan
 * Body: { "url": "example.com" }
 * Returns structured X-Ray report from real website evidence,
 * or a structured error (never a fake score).
 */

import {
  normalizeUrl,
  displayHost,
  ValidationError,
  ScanError,
} from "../lib/validate.js";
import { secureFetch } from "../lib/fetch-secure.js";
import { extractEvidence } from "../lib/extract.js";
import { runAllScanners } from "../lib/scanners/index.js";
import { buildReport } from "../lib/report.js";
import { checkRateLimit, rateLimitMessage } from "../lib/rate-limit.js";
import { resolveIdentity } from "../lib/identity.js";
import { allowedOrigin, corsHeaders, json } from "../lib/http.js";

export async function onRequestOptions(context) {
  const o = allowedOrigin(context.request, context.env);
  if (!o.ok) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(o.origin) });
}

/**
 * Pages that exist but have nothing to analyse (parked / for-sale / blank).
 * Returns a human reason, or null when the page looks like a real site.
 */
export function detectNoContent(evidence) {
  const title = String(evidence.title || "").trim();
  const hasStructure =
    title ||
    (evidence.h1 || []).length ||
    (evidence.links || []).length ||
    (evidence.images || []).length;
  if (!hasStructure) {
    return "This page has no readable content. If the site is built entirely with JavaScript, X-Ray cannot read it yet.";
  }
  if (
    /(domain (is )?for sale|buy this domain|this domain (may be|is) for sale|parked (free|domain)|domain parking)/i.test(
      title
    ) &&
    (evidence.links || []).length < 5
  ) {
    return "This looks like a parked domain with no real website to scan.";
  }
  return null;
}

export async function onRequestPost(context) {
  const origin = allowedOrigin(context.request, context.env);
  if (!origin.ok) {
    return json({ error: "Origin not allowed", code: "FORBIDDEN_ORIGIN" }, 403);
  }
  const cors = corsHeaders(origin.origin);
  const reply = (data, status = 200, extra = {}) =>
    json(data, status, { ...cors, ...extra });

  let body;
  try {
    body = await context.request.json();
  } catch {
    return reply(
      { error: "Expected JSON body with a url field", code: "BAD_BODY" },
      400
    );
  }

  const rawUrl = body?.url;
  let url;
  try {
    url = normalizeUrl(rawUrl);
  } catch (err) {
    return reply(
      {
        error: err.message || "Invalid URL",
        code: err.code || "INVALID_URL",
      },
      err.status || 400
    );
  }

  // Charge the allowance only for well-formed requests (typos are free).
  const identity = await resolveIdentity(context.request, context.env);
  const limit = await checkRateLimit(identity, context.env);
  const rlHeaders = {
    "RateLimit-Limit": String(limit.limit),
    "RateLimit-Remaining": String(limit.remaining),
    "RateLimit-Reset": String(limit.resetSec),
  };
  if (!limit.allowed) {
    return reply(
      {
        error: rateLimitMessage(limit),
        code: "RATE_LIMIT",
        scope: limit.scope,
        retryAfterSec: limit.retryAfterSec,
        limit: limit.limit,
        plan: limit.plan,
      },
      429,
      { ...rlHeaders, "Retry-After": String(limit.retryAfterSec) }
    );
  }

  try {
    const fetched = await secureFetch(url);

    // Only score successful HTML fetches (secureFetch already enforces this)
    if (!fetched || fetched.status < 200 || fetched.status >= 300) {
      throw new ScanError(
        `This page returned ${fetched?.status ?? "an error"}. X-Ray only scores successful pages.`,
        `HTTP_${fetched?.status || "ERROR"}`,
        422
      );
    }

    const evidence = await extractEvidence(fetched.body, {
      finalUrl: fetched.finalUrl,
      status: fetched.status,
      headers: fetched.headers,
      elapsedMs: fetched.elapsedMs,
      redirectChain: fetched.redirectChain,
      truncated: fetched.truncated,
      htmlBytes: fetched.body.length,
    });

    const noContent = detectNoContent(evidence);
    if (noContent) {
      throw new ScanError(noContent, "NO_CONTENT", 422);
    }

    const scannerResults = await runAllScanners(evidence, { url });
    const report = buildReport({ url, evidence, scannerResults });
    report.quota = {
      plan: limit.plan,
      limit: limit.limit,
      remaining: limit.remaining,
      resetSec: limit.resetSec,
    };

    return reply(report, 200, rlHeaders);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof ScanError || err.code) {
      return reply(
        {
          error: err.message || "Scan rejected",
          code: err.code || "SCAN_REJECTED",
          url: url ? displayHost(url) : undefined,
        },
        err.status || 422
      );
    }
    console.error("scan error", err);
    return reply(
      {
        error: "We could not complete this scan. Please try again.",
        code: "INTERNAL",
      },
      500
    );
  }
}
