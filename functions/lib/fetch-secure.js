/**
 * Secure page fetcher — timeouts, size limits, redirect re-validation.
 */

import { assertSafeUrl, ValidationError } from "./validate.js";

const DEFAULTS = {
  timeoutMs: 10000,
  maxRedirects: 5,
  maxBytes: 1_500_000, // ~1.5 MB HTML cap
  userAgent:
    "VEXDYN-XRay/1.0 (+https://vexdyn.com; security research scanner; contact: scan@vexdyn.com)",
};

/**
 * @typedef {Object} FetchResult
 * @property {string} finalUrl
 * @property {number} status
 * @property {string} statusText
 * @property {Record<string,string>} headers
 * @property {string} body
 * @property {number} elapsedMs
 * @property {string[]} redirectChain
 * @property {boolean} truncated
 */

/**
 * Fetch a URL with SSRF-safe redirect following and response limits.
 * @returns {Promise<FetchResult>}
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
          // Prefer not to cache scan targets through CF edge
          cacheTtl: 0,
          cacheEverything: false,
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new ValidationError("Request timed out", "TIMEOUT");
      }
      throw new ValidationError(`Failed to reach host: ${err.message}`, "FETCH_FAILED");
    } finally {
      clearTimeout(timer);
    }

    // Redirect hop
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const loc = response.headers.get("location");
      if (!loc) {
        throw new ValidationError("Redirect without Location header", "BAD_REDIRECT");
      }
      redirects += 1;
      if (redirects > opts.maxRedirects) {
        throw new ValidationError("Too many redirects", "TOO_MANY_REDIRECTS");
      }
      let next;
      try {
        next = new URL(loc, current);
      } catch {
        throw new ValidationError("Invalid redirect location", "BAD_REDIRECT");
      }
      assertSafeUrl(next); // re-validate every hop
      redirectChain.push(next.toString());
      current = next;
      continue;
    }

    const headers = {};
    response.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    const contentType = (headers["content-type"] || "").toLowerCase();
    // Allow HTML and XHTML; soft-allow unknown (some servers mislabel)
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("text/plain") &&
      !contentType.includes("application/octet-stream")
    ) {
      // Still read a bit — some sites serve HTML as application/json mistakenly
    }

    const { text, truncated } = await readLimited(response, opts.maxBytes);
    const elapsedMs = Date.now() - started;

    return {
      finalUrl: current.toString(),
      status: response.status,
      statusText: response.statusText,
      headers,
      body: text,
      elapsedMs,
      redirectChain,
      truncated,
    };
  }
}

async function readLimited(response, maxBytes) {
  // Prefer streaming when body is available
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
