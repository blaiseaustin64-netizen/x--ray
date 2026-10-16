/**
 * Who is making this request?
 *
 * - Anonymous visitors are identified by their Cloudflare-provided IP.
 * - Signed-in users are identified by whatever your account backend says.
 *
 * HOW TO CONNECT YOUR ACCOUNTS BACKEND
 * ------------------------------------
 * Set AUTH_VERIFY_URL (Cloudflare Pages -> Settings -> Variables) to an
 * endpoint on your backend that accepts the user's session token and returns
 * the profile as JSON:
 *
 *     GET <AUTH_VERIFY_URL>
 *     Authorization: Bearer <token the browser sent>
 *     -> 200 { "id": "user_123", "plan": "free" | "pro", "name": "...", "email": "..." }
 *     -> 401 (or anything non-200) when the token is invalid
 *
 * That is all X-Ray needs. Rate limits and server-side history then switch
 * from per-IP to per-user automatically. The browser attaches the token via
 * getAuthToken() in js/config.js.
 */

const PLANS = new Set(["free", "pro"]);
const VERIFY_CACHE_MS = 60_000;
const verified = new Map(); // tokenHash -> { until, user }

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.id === "undefined" || data.id === null) return null;
    const user = {
      id: String(data.id).slice(0, 128),
      plan: PLANS.has(data.plan) ? data.plan : "free",
      name: data.name ? String(data.name).slice(0, 120) : null,
    };
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
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token && env.AUTH_VERIFY_URL) {
    const user = await verifyToken(token, env);
    if (user) return { type: "user", id: user.id, plan: user.plan, key: `u:${user.id}`, ip };
  }
  return { type: "anon", id: null, plan: "anon", key: `ip:${ip}`, ip };
}
