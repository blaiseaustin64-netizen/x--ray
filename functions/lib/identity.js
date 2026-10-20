/**
 * Who is making this request?
 *
 * - Anonymous visitors: Cloudflare-provided IP (cf-connecting-ip).
 * - Signed-in users: verified against the shared VEXDYN auth backend.
 *
 * AUTH_VERIFY_URL (Pages env, https only) should point at:
 *   https://vexdyn-backend.blaisepatrick556.workers.dev/auth/me
 *
 * That endpoint expects Authorization: Bearer <session token> and returns:
 *   { "ok": true, "user": { "id", "email", "emailVerified", "displayName", "createdAt" }, "memberships": [...] }
 *   or 401 when the token is invalid.
 *
 * This module normalizes that shape into { id, plan, name } for rate limits and history.
 * Browser-supplied user ids are never trusted — only the verified response is used.
 */

const PLANS = new Set(["free", "pro"]);
const VERIFY_CACHE_MS = 60_000;
const verified = new Map(); // tokenHash -> { until, user }

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Map shared-backend /auth/me JSON into X-Ray's internal user shape.
 * Accepts both the VEXDYN Core shape and a minimal { id, plan, name } profile.
 */
function normalizeUser(data) {
  if (!data || typeof data !== "object") return null;

  // VEXDYN Core: { ok: true, user: { id, email, displayName, ... }, memberships? }
  const profile = data.user && typeof data.user === "object" ? data.user : data;
  if (typeof profile.id === "undefined" || profile.id === null) return null;

  const memberships = Array.isArray(data.memberships) ? data.memberships : [];
  const xrayMem = memberships.find(
    (m) => m && String(m.product || "").toLowerCase() === "xray"
  );
  let plan = "free";
  if (PLANS.has(profile.plan)) plan = profile.plan;
  else if (xrayMem && (xrayMem.role === "owner" || xrayMem.role === "admin" || xrayMem.role === "pro")) {
    plan = "pro";
  }

  const name =
    profile.displayName ||
    profile.name ||
    (profile.email ? String(profile.email).split("@")[0] : null);

  return {
    id: String(profile.id).slice(0, 128),
    plan,
    name: name ? String(name).slice(0, 120) : null,
    email: profile.email ? String(profile.email).slice(0, 254) : null,
  };
}

async function verifyToken(token, env) {
  const url = String(env.AUTH_VERIFY_URL || "");
  if (!/^https:\/\//i.test(url)) return null; // never send tokens over plain http

  const hash = await sha256Hex(token);
  const hit = verified.get(hash);
  if (hit && hit.until > Date.now()) return hit.user;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-Session-Token": token,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const user = normalizeUser(data);
    if (!user) return null;
    verified.set(hash, { until: Date.now() + VERIFY_CACHE_MS, user });
    if (verified.size > 2000) {
      const now = Date.now();
      for (const [k, v] of verified) if (v.until < now) verified.delete(k);
    }
    return user;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<{type:'anon'|'user', id:string|null, plan:'anon'|'free'|'pro', key:string, ip:string}>}
 */
export async function resolveIdentity(request, env = {}) {
  // cf-connecting-ip is set by Cloudflare and cannot be spoofed by clients.
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  const auth = request.headers.get("authorization") || "";
  let token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    const header = request.headers.get("x-session-token");
    if (header?.trim()) token = header.trim();
  }

  if (token && env.AUTH_VERIFY_URL) {
    const user = await verifyToken(token, env);
    if (user) return { type: "user", id: user.id, plan: user.plan, key: `u:${user.id}`, ip };
  }
  return { type: "anon", id: null, plan: "anon", key: `ip:${ip}`, ip };
}
