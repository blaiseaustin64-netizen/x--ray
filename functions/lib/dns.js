/**
 * DNS existence + public-address check using Cloudflare's DNS-over-HTTPS JSON API.
 *
 * Why: a syntactically valid hostname like "khisgushgxigxuxgwi.com" or
 * "asdf.qzxv" should never reach the scanner. A real lookup tells us:
 *   - the domain / TLD actually exists (NXDOMAIN otherwise)
 *   - it has an address at all
 *   - none of its addresses are private/internal (SSRF defence in depth)
 *
 * Fail-open on resolver outages: if the DoH service itself is unreachable we
 * do not block the scan (the fetch will fail naturally if the site is fake).
 */

import { ScanError, ValidationError, isPrivateIp } from "./validate.js";

const DOH = "https://cloudflare-dns.com/dns-query";
const CACHE_MS = 120_000;
const cache = new Map(); // host -> expiresAt

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

async function query(name, type, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(
      `${DOH}?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { Accept: "application/dns-json" }, signal: controller.signal }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} hostname
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 */
export async function assertResolvesToPublicHost(hostname, opts = {}) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) throw new ValidationError("Empty hostname", "SSRF");

  // IP literals are already handled (and blocked) by assertSafeUrl.
  if (host.includes(":") || IPV4_LITERAL.test(host)) return;

  const hit = cache.get(host);
  if (hit && hit > Date.now()) return;

  const fetchImpl = opts.fetchImpl || fetch;
  const timeoutMs = opts.timeoutMs ?? 2500;

  const [a, aaaa] = await Promise.all([
    query(host, "A", fetchImpl, timeoutMs),
    query(host, "AAAA", fetchImpl, timeoutMs),
  ]);

  // Resolver unreachable for both lookups -> fail open.
  if (!a && !aaaa) return;

  // Status 3 = NXDOMAIN (domain or TLD does not exist).
  if ((a && a.Status === 3) || (aaaa && aaaa.Status === 3)) {
    throw new ScanError(
      "We could not find this website. Check the address and try again.",
      "DNS_FAILED",
      422
    );
  }

  const ips = [];
  for (const r of [a, aaaa]) {
    for (const ans of r?.Answer || []) {
      if (ans.type === 1 || ans.type === 28) ips.push(String(ans.data));
    }
  }

  if (ips.length === 0) {
    throw new ScanError(
      "This domain exists but does not point to a website yet.",
      "DNS_NO_ADDRESS",
      422
    );
  }

  if (ips.some(isPrivateIp)) {
    throw new ValidationError("This address points to a private network and cannot be scanned", "SSRF");
  }

  cache.set(host, Date.now() + CACHE_MS);
  if (cache.size > 2000) {
    const now = Date.now();
    for (const [k, exp] of cache) if (exp < now) cache.delete(k);
  }
}

export function _clearDnsCache() {
  cache.clear();
}
