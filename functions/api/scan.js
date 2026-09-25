/**
 * POST /api/scan
 * Body: { "url": "example.com" }
 * Returns structured X-Ray report from real website evidence.
 */

import { normalizeUrl, displayHost, ValidationError } from "../lib/validate.js";
import { secureFetch } from "../lib/fetch-secure.js";
import { extractEvidence } from "../lib/extract.js";
import { runAllScanners } from "../lib/scanners/index.js";
import { buildReport } from "../lib/report.js";
import { checkRateLimit } from "../lib/rate-limit.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const ip =
    context.request.headers.get("cf-connecting-ip") ||
    context.request.headers.get("x-forwarded-for") ||
    "unknown";

  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return json(
      { error: "Rate limit exceeded. Try again shortly.", code: "RATE_LIMIT" },
      429,
      { "Retry-After": String(limit.retryAfterSec || 60) }
    );
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Expected JSON body with a url field", code: "BAD_BODY" }, 400);
  }

  const rawUrl = body?.url;
  let url;
  try {
    url = normalizeUrl(rawUrl);
  } catch (err) {
    const status = err.status || 400;
    return json(
      { error: err.message || "Invalid URL", code: err.code || "INVALID_URL" },
      status
    );
  }

  try {
    const fetched = await secureFetch(url);
    const evidence = await extractEvidence(fetched.body, {
      finalUrl: fetched.finalUrl,
      status: fetched.status,
      headers: fetched.headers,
      elapsedMs: fetched.elapsedMs,
      redirectChain: fetched.redirectChain,
      truncated: fetched.truncated,
      htmlBytes: fetched.body.length,
    });

    const scannerResults = await runAllScanners(evidence, { url });
    const report = buildReport({ url, evidence, scannerResults });

    return json(report, 200);
  } catch (err) {
    if (err instanceof ValidationError || err.code) {
      return json(
        {
          error: err.message || "Scan rejected",
          code: err.code || "SCAN_REJECTED",
          url: displayHost(url),
        },
        err.status || 400
      );
    }
    console.error("scan error", err);
    return json(
      {
        error: "Scan failed due to an unexpected error",
        code: "INTERNAL",
        detail: String(err.message || err),
      },
      500
    );
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, ...extraHeaders },
  });
}
