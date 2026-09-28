/**
 * Secure page fetcher — timeouts, size limits, redirect re-validation.
 * Failed fetches throw ScanError / ValidationError — never return a soft body.
 */

import { assertSafeUrl, ValidationError, ScanError } from "./validate.js";

const DEFAULTS = {
  timeoutMs: 10000,
  maxRedirects: 5,
  maxBytes: 1_500_000,
  userAgent:
    "VEXDYN-XRay/1.0 (+https://vexdyn.com; security research scanner; contact: scan@vexdyn.com)",
};

const NON_HTML_TYPES = [
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/octet-stream",
  "application/json",
  "application/xml",
  "text/xml",
  "text/plain",
  "image/",
  "video/",
  "audio/",
  "font/",
];

/**
 * Fetch a URL with SSRF-safe redirect following and response limits.
 * @returns {Promise<object>}
 */
export async function secureFetch(startUrl, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const redirectChain = [];
  let current = typeof startUrl === "string" ? new URL(startUrl) : startUrl;
  assertSafeUrl(current);

  const started = Date.now();
  let redirects = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

    let response;
    try {
      response = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": opts.userAgent,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cf: {
          cacheTtl: 0,
          cacheEverything: false,
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new ScanError(
          "This website took too long to respond. Try again later.",
          "TIMEOUT",
          504
        );
      }
      const msg = String(err.message || err);
      if (/ENOTFOUND|getaddrinfo|Name not resolved|DNS/i.test(msg)) {
        throw new ScanError(
          "We could not find this website. Check the address and try again.",
          "DNS_FAILED",
          422
        );
      }
      if (/ECONNREFUSED|connection refused/i.test(msg)) {
        throw new ScanError(
          "Connection refused by the server.",
          "CONNECTION_REFUSED",
          422
        );
      }
      if (/CERT|SSL|TLS|certificate/i.test(msg)) {
        throw new ScanError(
          "Secure connection (TLS) to this site failed.",
          "TLS_ERROR",
          422
        );
      }
      throw new ScanError(
        "We could not reach this website. It may be offline or the address may be wrong.",
        "FETCH_FAILED",
        422
      );
    } finally {
      clearTimeout(timer);
    }

    // Redirect hop
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const loc = response.headers.get("location");
      if (!loc) {
        throw new ScanError(
          "The site returned a redirect without a destination.",
          "BAD_REDIRECT",
          422
        );
      }
      redirects += 1;
      if (redirects > opts.maxRedirects) {
        throw new ScanError(
          "Too many redirects — stopped for safety.",
          "TOO_MANY_REDIRECTS",
          422
        );
      }
      let next;
      try {
        next = new URL(loc, current);
      } catch {
        throw new ScanError("Invalid redirect location.", "BAD_REDIRECT", 422);
      }
      assertSafeUrl(next);
      redirectChain.push(next.toString());
      current = next;
      continue;
    }

    const status = response.status;

    // Blocked / auth — do not score
    if (status === 401) {
      throw new ScanError(
        "This site requires a login (401). X-Ray cannot scan private pages.",
        "HTTP_401",
        422
      );
    }
    if (status === 403) {
      throw new ScanError(
        "This site blocked the scanner (403). It cannot be scored.",
        "HTTP_403",
        422
      );
    }
    if (status === 429) {
      throw new ScanError(
        "This site rate-limited the scanner (429). Try again later.",
        "HTTP_429",
        422
      );
    }

    // Any other 4xx / 5xx — error, no report
    if (status >= 400) {
      throw new ScanError(
        `This page returned ${status}. X-Ray only scores successful pages.`,
        `HTTP_${status}`,
        422
      );
    }

    if (status < 200 || status >= 300) {
      throw new ScanError(
        `Unexpected HTTP status ${status}.`,
        `HTTP_${status}`,
        422
      );
    }

    const headers = {};
    response.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    const contentType = (headers["content-type"] || "").toLowerCase();
    if (contentType && isClearlyNonHtml(contentType)) {
      throw new ScanError(
        "This URL does not return a web page (non-HTML response). X-Ray only scans HTML pages.",
        "NOT_HTML",
        422
      );
    }

    const { text, truncated } = await readLimited(response, opts.maxBytes);
    const elapsedMs = Date.now() - started;

    // Sniff: must look like HTML if type was empty/ambiguous
    if (!looksLikeHtml(text, contentType)) {
      throw new ScanError(
        "This URL does not return a web page (non-HTML response). X-Ray only scans HTML pages.",
        "NOT_HTML",
        422
      );
    }

    return {
      finalUrl: current.toString(),
      status,
      statusText: response.statusText,
      headers,
      body: text,
      elapsedMs,
      redirectChain,
      truncated,
    };
  }
}

function isClearlyNonHtml(contentType) {
  const ct = contentType.split(";")[0].trim();
  if (ct === "text/html" || ct === "application/xhtml+xml") return false;
  for (const prefix of NON_HTML_TYPES) {
    if (ct === prefix || ct.startsWith(prefix)) return true;
  }
  return false;
}

function looksLikeHtml(body, contentType) {
  if (contentType && (contentType.includes("text/html") || contentType.includes("xhtml"))) {
    return true;
  }
  const sample = (body || "").slice(0, 2048).toLowerCase();
  return (
    sample.includes("<html") ||
    sample.includes("<!doctype html") ||
    sample.includes("<head") ||
    sample.includes("<body") ||
    sample.includes("<title")
  );
}

async function readLimited(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const buf = await response.arrayBuffer();
    const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    return {
      text: new TextDecoder("utf-8", { fatal: false }).decode(slice),
      truncated: buf.byteLength > maxBytes,
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      const remain = maxBytes - (total - value.byteLength);
      if (remain > 0) chunks.push(value.slice(0, remain));
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    chunks.push(value);
  }

  const merged = concatUint8(chunks);
  return {
    text: new TextDecoder("utf-8", { fatal: false }).decode(merged),
    truncated,
  };
}

function concatUint8(chunks) {
  const len = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
