import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let DatabaseSync;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* older node */ }

const skip = !DatabaseSync;

function d1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql.replace(/\?(\d+)/g, "?"));
      let args = [];
      const api = {
        bind: (...a) => ((args = a), api),
        run: async () => (stmt.run(...args), { success: true }),
        all: async () => ({ results: stmt.all(...args) }),
      };
      return api;
    },
  };
}

async function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const { onRequest } = await import("../functions/api/history.js");
  const realFetch = globalThis.fetch;
  // identity backend: token "good-<id>" -> user <id>
  globalThis.fetch = async (url, opts) => {
    const tok = (opts?.headers?.Authorization || "").replace("Bearer ", "");
    if (tok.startsWith("good-")) return { ok: true, json: async () => ({ id: tok.slice(5), plan: "free" }) };
    return { ok: false, json: async () => ({}) };
  };
  const env = { DB: d1(db), AUTH_VERIFY_URL: "https://accounts.example.com/me" };
  const call = (method, path, token, body) =>
    onRequest({
      env,
      request: new Request(`https://x.test${path}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }),
    });
  return { call, restore: () => (globalThis.fetch = realFetch) };
}

const report = (url, score) => ({ url, overallScore: score, verdict: "OK", verdictLevel: "warn", findings: [] });

test("history requires sign-in", { skip }, async () => {
  const { call, restore } = await setup();
  assert.equal((await call("GET", "/api/history")).status, 401);
  restore();
});

test("save, list by host, isolate users, delete", { skip }, async () => {
  const { call, restore } = await setup();
  assert.equal((await call("POST", "/api/history", "good-1", { report: report("acme.com", 60) })).status, 201);
  assert.equal((await call("POST", "/api/history", "good-1", { report: report("acme.com", 72) })).status, 201);
  await call("POST", "/api/history", "good-1", { report: report("other.com", 40) });
  await call("POST", "/api/history", "good-2", { report: report("acme.com", 10) });

  const mine = await (await call("GET", "/api/history?host=acme.com", "good-1")).json();
  assert.equal(mine.entries.length, 2);
  assert.ok(mine.entries.every((e) => e.url === "acme.com"));

  const theirs = await (await call("GET", "/api/history", "good-2")).json();
  assert.equal(theirs.entries.length, 1);

  const id = mine.entries[0].id;
  assert.equal((await call("DELETE", `/api/history?id=${id}`, "good-2")).status, 200); // other user: no effect
  assert.equal((await (await call("GET", "/api/history", "good-1")).json()).entries.length, 3);
  await call("DELETE", `/api/history?id=${id}`, "good-1");
  assert.equal((await (await call("GET", "/api/history", "good-1")).json()).entries.length, 2);
  restore();
});

test("rejects invalid reports", { skip }, async () => {
  const { call, restore } = await setup();
  assert.equal((await call("POST", "/api/history", "good-1", { report: { url: "a.com" } })).status, 400);
  restore();
});
