/**
 * Lightweight in-memory rate limit for a single Worker isolate.
 * Not a global distributed limiter — good enough as a first line of defense.
 */

const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

export function checkRateLimit(key) {
  const now = Date.now();
  let bucket = hits.get(key);
  if (!bucket || now - bucket.start > WINDOW_MS) {
    bucket = { start: now, count: 0 };
    hits.set(key, bucket);
  }
  bucket.count += 1;

  // Opportunistic cleanup
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (now - v.start > WINDOW_MS * 2) hits.delete(k);
    }
  }

  if (bucket.count > MAX_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((WINDOW_MS - (now - bucket.start)) / 1000),
    };
  }
  return { allowed: true, remaining: MAX_PER_WINDOW - bucket.count };
}
