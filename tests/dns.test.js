import test from "node:test";
import assert from "node:assert/strict";
import { assertResolvesToPublicHost, _clearDnsCache } from "../functions/lib/dns.js";

function doh(map) {
  // map: { "A": {Status, Answer}, "AAAA": {...} }
  return async (url) => {
    const type = new URL(url).searchParams.get("type");
    const body = map[type];
    if (body === "down") throw new Error("network");
    return { ok: true, json: async () => body };
  };
}
const a = (ip) => ({ Status: 0, Answer: [{ type: 1, data: ip }] });
const none = { Status: 0 };
const nx = { Status: 3 };

test("gibberish domain (NXDOMAIN) is rejected", async () => {
  _clearDnsCache();
  await assert.rejects(
    assertResolvesToPublicHost("khisgushgxigxuxgwi.com", { fetchImpl: doh({ A: nx, AAAA: nx }) }),
    (e) => e.code === "DNS_FAILED"
  );
});
test("fake TLD (NXDOMAIN) is rejected", async () => {
  _clearDnsCache();
  await assert.rejects(
    assertResolvesToPublicHost("asdf.qzxv", { fetchImpl: doh({ A: nx, AAAA: nx }) }),
    (e) => e.code === "DNS_FAILED"
  );
});
test("domain with no address is rejected", async () => {
  _clearDnsCache();
  await assert.rejects(
    assertResolvesToPublicHost("empty.example", { fetchImpl: doh({ A: none, AAAA: none }) }),
    (e) => e.code === "DNS_NO_ADDRESS"
  );
});
test("domain resolving to a private address is blocked", async () => {
  _clearDnsCache();
  await assert.rejects(
    assertResolvesToPublicHost("evil.example", { fetchImpl: doh({ A: a("10.0.0.5"), AAAA: none }) }),
    (e) => e.code === "SSRF"
  );
});
test("real-looking domain with a public IP passes", async () => {
  _clearDnsCache();
  await assertResolvesToPublicHost("example.com", { fetchImpl: doh({ A: a("93.184.216.34"), AAAA: none }) });
});
test("resolver outage fails open (does not block real sites)", async () => {
  _clearDnsCache();
  await assertResolvesToPublicHost("example.com", { fetchImpl: doh({ A: "down", AAAA: "down" }) });
});
