/**
 * URL validation + SSRF hardening (string-level + post-redirect re-check).
 * Workers cannot pre-resolve DNS, so we block private patterns aggressively
 * and re-validate every redirect hop destination.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "0.0.0.0",
]);

/** IPv4 private / reserved / link-local / cloud-metadata ranges */
const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./, // link-local + AWS/GCP metadata
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./, // CGNAT
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^198\.18\./,
  /^198\.19\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^22[4-9]\./,
  /^23\d\./,
  /^24\d\./,
  /^25[0-5]\./,
];

const PRIVATE_V6 = [
  /^::1$/,
  /^fc/i,
  /^fd/i,
  /^fe80/i,
  /^::ffff:(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/i,
];

export class ValidationError extends Error {
  constructor(message, code = "INVALID_URL") {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.status = 400;
  }
}

/**
 * Normalize user input → absolute http(s) URL object.
 */
export function normalizeUrl(input) {
  if (input == null || typeof input !== "string") {
    throw new ValidationError("URL is required");
  }
  let raw = input.trim();
  if (!raw) throw new ValidationError("URL is required");
  if (raw.length > 2048) throw new ValidationError("URL is too long");

  // Reject obvious schemes
  if (/^(javascript|data|file|ftp|blob):/i.test(raw)) {
    throw new ValidationError("Unsupported URL scheme", "BAD_SCHEME");
  }

  if (!/^https?:\/\//i.test(raw)) {
    raw = "https://" + raw;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError("Could not parse URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Only http and https URLs are allowed", "BAD_SCHEME");
  }

  // Strip credentials / hash
  url.username = "";
  url.password = "";
  url.hash = "";

  assertSafeHostname(url.hostname);
  return url;
}

/**
 * Re-validate any URL (original or redirect target).
 */
export function assertSafeUrl(urlOrString) {
  const url =
    typeof urlOrString === "string" ? new URL(urlOrString) : urlOrString;
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Redirect to unsupported scheme blocked", "SSRF");
  }
  assertSafeHostname(url.hostname);
  return url;
}

function assertSafeHostname(hostname) {
  const host = (hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) throw new ValidationError("Empty hostname", "SSRF");

  if (BLOCKED_HOSTS.has(host)) {
    throw new ValidationError("Scanning this host is not allowed", "SSRF");
  }

  // Local / internal TLDs
  if (
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host.endsWith(".home")
  ) {
    throw new ValidationError("Internal hostnames are blocked", "SSRF");
  }

  // Literal IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    for (const re of PRIVATE_V4) {
      if (re.test(host)) {
        throw new ValidationError("Private or reserved IP addresses are blocked", "SSRF");
      }
    }
  }

  // IPv6 (bracketed in URL.hostname without brackets)
  if (host.includes(":")) {
    for (const re of PRIVATE_V6) {
      if (re.test(host)) {
        throw new ValidationError("Private IPv6 addresses are blocked", "SSRF");
      }
    }
  }

  // Hex / decimal IP tricks (e.g. 0x7f000001)
  if (/^0x[0-9a-f]+$/i.test(host) || /^\d{8,}$/.test(host)) {
    throw new ValidationError("Numeric host encodings are blocked", "SSRF");
  }
}

export function displayHost(url) {
  return url.hostname.replace(/^www\./, "");
}
