/**
 * Plan-based rate limiting with two windows (per minute + per day).
 *
 * Keyed by user id for signed-in users, by IP for anonymous visitors, so
 * connecting your accounts backend (see identity.js) gives each plan its own
 * allowance with no further changes here.
 *
 * Storage: bind a KV namespace as RATE_KV for limits shared across all
 * Worker isolates. Without it, counts live in memory (one isolate only).
 *
 * Tune limits without code changes via environment variables, e.g.
 *   RATE_ANON_PER_DAY=15  RATE_FREE_PER_DAY=60  RATE_PRO_PER_MINUTE=20
 */

export const DEFAULT_PLANS = {
  anon: { perMinute: 4, perDay: 15 },
  free: { perMinute: 8, perDay: 60 },
  pro: { perMinute: 20, perDay: 500 },
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const memory = new Map(); // "m|d:key:slot" -> count

export function planLimits(plan, env = {}) {
  const base = DEFAULT_PLANS[plan] || DEFAULT_PLANS.anon;
  const up = String(plan || "anon").toUpperCase();
  const num = (v, d) => (Number.isFinite(parseInt(v, 10)) && parseInt(v, 10) > 0 ? parseInt(v, 10) : d);
  return {
    perMinute: num(env[`RATE_${up}_PER_MINUTE`], base.perMinute),
    perDay: num(env[`RATE_${up}_PER_DAY`], base.perDay),
  };
}

/** "5 seconds", "12 minutes", "about 3 hours" */
export function humanizeWait(seconds) {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  if (s < 3600) {
    const m = Math.ceil(s / 60);
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  const h = Math.ceil(s / 3600);
  return `about ${h} hour${h === 1 ? "" : "s"}`;
}

export function rateLimitMessage(result) {
  const wait = humanizeWait(result.retryAfterSec);
  if (result.scope === "minute") {
    return `You are scanning too fast. Try again in ${wait}.`;
  }
  return `You have used all ${result.limit} scans for today. Try again in ${wait}.`;
}

async function getCount(kv, k) {
  if (kv) return parseInt(await kv.get(k), 10) || 0;
  return memory.get(k) || 0;
}

async function bump(kv, k, ttlSec) {
  if (kv) {
    const next = (parseInt(await kv.get(k), 10) || 0) + 1;
    await kv.put(k, String(next), { expirationTtl: ttlSec });
    return next;
  }
  const next = (memory.get(k) || 0) + 1;
  memory.set(k, next);
  if (memory.size > 8000) {
    const nowMin = Math.floor(Date.now() / MINUTE_MS);
    for (const key of memory.keys()) {
      const m = key.match(/^m:.*:(\d+)$/);
      if (m && Number(m[1]) < nowMin - 2) memory.delete(key);
    }
  }
  return next;
}

/**
 * @param {{key:string, plan:string}} identity from resolveIdentity()
 * @returns {Promise<{allowed:boolean, scope?:'minute'|'day', retryAfterSec?:number,
 *   limit:number, remaining:number, resetSec:number, plan:string}>}
 */
export async function checkRateLimit(identity, env = {}) {
  const plan = identity.plan || "anon";
  const { perMinute, perDay } = planLimits(plan, env);
  const now = Date.now();
  const minSlot = Math.floor(now / MINUTE_MS);
  const daySlot = Math.floor(now / DAY_MS);
  const minuteResetSec = Math.ceil(((minSlot + 1) * MINUTE_MS - now) / 1000);
  const dayResetSec = Math.ceil(((daySlot + 1) * DAY_MS - now) / 1000);

  const mk = `m:${identity.key}:${minSlot}`;
  const dk = `d:${identity.key}:${daySlot}`;

  let kv = env.RATE_KV || null;
  let minuteCount;
  let dayCount;
  try {
    [minuteCount, dayCount] = await Promise.all([getCount(kv, mk), getCount(kv, dk)]);
  } catch {
    kv = null; // KV hiccup: fall back to memory rather than blocking everyone
    [minuteCount, dayCount] = await Promise.all([getCount(null, mk), getCount(null, dk)]);
  }

  if (dayCount >= perDay) {
    return { allowed: false, scope: "day", retryAfterSec: dayResetSec, limit: perDay, remaining: 0, resetSec: dayResetSec, plan };
  }
  if (minuteCount >= perMinute) {
    return { allowed: false, scope: "minute", retryAfterSec: minuteResetSec, limit: perDay, remaining: Math.max(0, perDay - dayCount), resetSec: dayResetSec, plan };
  }

  try {
    await Promise.all([bump(kv, mk, 120), bump(kv, dk, 90_000)]);
  } catch {
    await Promise.all([bump(null, mk, 120), bump(null, dk, 90_000)]);
  }
  return { allowed: true, limit: perDay, remaining: Math.max(0, perDay - dayCount - 1), resetSec: dayResetSec, plan };
}

export function _resetRateLimitMemory() {
  memory.clear();
}
