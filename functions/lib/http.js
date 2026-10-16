/** Shared HTTP helpers for API routes: same-origin CORS + JSON responses. */

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  Vary: "Origin",
};

/**
 * Same-origin only by default. To allow other sites, set ALLOWED_ORIGINS
 * (comma-separated) as an environment variable in Cloudflare Pages.
 */
export function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return { ok: true, origin: null }; // same-origin fetch or curl
  const self = new URL(request.url).origin;
  const extra = String(env?.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origin === self || extra.includes(origin)) return { ok: true, origin };
  return { ok: false, origin };
}

export function corsHeaders(origin, methods = "POST, OPTIONS") {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BASE_HEADERS, ...extraHeaders },
  });
}
