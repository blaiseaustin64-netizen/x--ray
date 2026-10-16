import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, rateLimitMessage, humanizeWait, planLimits, _resetRateLimitMemory } from "../functions/lib/rate-limit.js";

test("humanizeWait", () => {
  assert.equal(humanizeWait(1), "1 second");
  assert.equal(humanizeWait(45), "45 seconds");
  assert.equal(humanizeWait(600), "10 minutes");
  assert.equal(humanizeWait(3 * 3600 - 5), "about 3 hours");
  assert.equal(humanizeWait(3600), "about 1 hour");
});

test("anonymous plan: per-minute burst limit then friendly message", async () => {
  _resetRateLimitMemory();
  const id = { key: "ip:1.1.1.1", plan: "anon" };
  const { perMinute } = planLimits("anon");
  for (let i = 0; i < perMinute; i++) assert.equal((await checkRateLimit(id)).allowed, true);
  const blocked = await checkRateLimit(id);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, "minute");
  assert.match(rateLimitMessage(blocked), /too fast.*Try again in/);
});

test("daily limit says 'try again in about N hours'", async () => {
  _resetRateLimitMemory();
  const env = { RATE_ANON_PER_DAY: "2", RATE_ANON_PER_MINUTE: "50" };
  const id = { key: "ip:2.2.2.2", plan: "anon" };
  await checkRateLimit(id, env);
  await checkRateLimit(id, env);
  const blocked = await checkRateLimit(id, env);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, "day");
  assert.match(rateLimitMessage(blocked), /used all 2 scans for today\. Try again in (about \d+ hours?|\d+ minutes?|\d+ seconds?)\./);
});

test("signed-in users have their own bucket and higher plan limits", async () => {
  _resetRateLimitMemory();
  const anon = planLimits("anon");
  const pro = planLimits("pro");
  assert.ok(pro.perDay > anon.perDay);
  const user = { key: "u:42", plan: "free" };
  const ip = { key: "ip:3.3.3.3", plan: "anon" };
  for (let i = 0; i < planLimits("anon").perMinute; i++) await checkRateLimit(ip);
  assert.equal((await checkRateLimit(ip)).allowed, false);
  assert.equal((await checkRateLimit(user)).allowed, true); // unaffected by the IP bucket
});

test("remaining counts down", async () => {
  _resetRateLimitMemory();
  const id = { key: "ip:4.4.4.4", plan: "free" };
  const first = await checkRateLimit(id);
  const second = await checkRateLimit(id);
  assert.equal(first.remaining - 1, second.remaining);
});

test("KV-backed counting shares state across calls", async () => {
  const store = new Map();
  const kv = { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
  const env = { RATE_KV: kv, RATE_ANON_PER_DAY: "1" };
  const id = { key: "ip:5.5.5.5", plan: "anon" };
  assert.equal((await checkRateLimit(id, env)).allowed, true);
  assert.equal((await checkRateLimit(id, env)).allowed, false);
});
