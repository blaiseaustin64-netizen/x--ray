/**
 * Server-side scan history for signed-in users (Cloudflare D1).
 *
 *   GET    /api/history?host=example.com&limit=50   -> { entries: [...] }
 *   POST   /api/history   { report }                 -> { entry }
 *   DELETE /api/history?id=<id>   |   ?all=1         -> { ok: true }
 *
 * Needs: (1) a D1 database bound as DB (see schema.sql, wrangler.toml), and
 *        (2) AUTH_VERIFY_URL so requests can be tied to a user (identity.js).
 * Without those it answers with a clear status instead of failing silently.
 */

import { allowedOrigin, corsHeaders, json } from "../lib/http.js";
import { resolveIdentity } from "../lib/identity.js";

const METHODS = "GET, POST, DELETE, OPTIONS";
const MAX_BODY_BYTES = 300_000;
const MAX_LIMIT = 200;

export async function onRequest(context) {
  const { request, env } = context;

  const origin = allowedOrigin(request, env);
  if (!origin.ok) return json({ error: "Origin not allowed", code: "FORBIDDEN_ORIGIN" }, 403);
  const cors = corsHeaders(origin.origin, METHODS);
  const reply = (data, status = 200) => json(data, status, cors);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (!env.DB) {
    return reply(
      { error: "History storage is not set up on this server yet.", code: "HISTORY_BACKEND_NOT_CONFIGURED" },
      501
    );
  }

  const identity = await resolveIdentity(request, env);
  if (identity.type !== "user") {
    return reply({ error: "Sign in to use synced history.", code: "AUTH_REQUIRED" }, 401);
  }
  const userId = identity.id;
  const url = new URL(request.url);

  try {
    if (request.method === "GET") {
      const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || 50));
      const host = normalizeHost(url.searchParams.get("host"));
      const stmt = host
        ? env.DB.prepare(
            "SELECT id, url, created_at, overall_score, verdict, verdict_level, report_json FROM scans WHERE user_id = ?1 AND host = ?2 ORDER BY created_at DESC LIMIT ?3"
          ).bind(userId, host, limit)
        : env.DB.prepare(
            "SELECT id, url, created_at, overall_score, verdict, verdict_level, report_json FROM scans WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2"
          ).bind(userId, limit);
      const { results } = await stmt.all();
      return reply({ entries: (results || []).map(rowToEntry) });
    }

    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return reply({ error: "Report too large", code: "TOO_LARGE" }, 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply({ error: "Expected JSON body", code: "BAD_BODY" }, 400);
      }
      const report = body?.report;
      if (
        !report ||
        typeof report.url !== "string" ||
        typeof report.overallScore !== "number" ||
        !Number.isFinite(report.overallScore) ||
        !Array.isArray(report.findings)
      ) {
        return reply({ error: "Not a valid X-Ray report", code: "INVALID_REPORT" }, 400);
      }

      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const score = Math.max(0, Math.min(100, Math.round(report.overallScore)));
      await env.DB.prepare(
        "INSERT INTO scans (id, user_id, host, url, overall_score, verdict, verdict_level, created_at, report_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
      )
        .bind(
          id,
          userId,
          normalizeHost(report.url),
          report.url.slice(0, 300),
          score,
          String(report.verdict || "").slice(0, 60),
          String(report.verdictLevel || "").slice(0, 20),
          createdAt,
          JSON.stringify(report)
        )
        .run();
      return reply({ entry: rowToEntry({ id, url: report.url, created_at: createdAt, overall_score: score, verdict: report.verdict, verdict_level: report.verdictLevel, report_json: JSON.stringify(report) }) }, 201);
    }

    if (request.method === "DELETE") {
      if (url.searchParams.get("all") === "1") {
        await env.DB.prepare("DELETE FROM scans WHERE user_id = ?1").bind(userId).run();
        return reply({ ok: true });
      }
      const id = url.searchParams.get("id");
      if (!id) return reply({ error: "Missing id", code: "BAD_REQUEST" }, 400);
      await env.DB.prepare("DELETE FROM scans WHERE id = ?1 AND user_id = ?2").bind(id, userId).run();
      return reply({ ok: true });
    }

    return reply({ error: "Method not allowed", code: "METHOD" }, 405);
  } catch (err) {
    console.error("history error", err);
    return reply({ error: "History request failed.", code: "INTERNAL" }, 500);
  }
}

function rowToEntry(r) {
  let report = null;
  try {
    report = JSON.parse(r.report_json);
  } catch {
    /* corrupt row: skipped by the client */
  }
  return {
    id: r.id,
    url: r.url,
    timestamp: r.created_at,
    overallScore: r.overall_score,
    verdict: r.verdict,
    verdictLevel: r.verdict_level,
    report,
    remote: true,
  };
}

export function normalizeHost(u) {
  return String(u || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0];
}
