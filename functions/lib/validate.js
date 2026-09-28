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
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./,
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

/** Common multi-part public suffixes (hostname must still have a label before these) */
const MULTI_PART_TLD = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au",
  "co.nz", "co.jp", "co.kr", "co.in",
  "com.br", "com.mx", "com.sg", "com.hk",
  "co.za", "com.ng", "com.gh", "com.ke",
]);

export class ValidationError extends Error {
  constructor(message, code = "INVALID_URL", status = 400) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Fetch / scan failures that must never produce a scored report.
 */
export class ScanError extends Error {
  constructor(message, code = "FETCH_FAILED", status = 422) {
    super(message);
    this.name = "ScanError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Normalize user input → absolute http(s) URL object.
 */
export function normalizeUrl(input) {
  if (input == null || typeof input !== "string") {
    throw new ValidationError(
      "Enter a full website address, like example.com",
      "INVALID_URL"
    );
  }
  let raw = input.trim();
  if (!raw) {
    throw new ValidationError(
      "Enter a full website address, like example.com",
      "INVALID_URL"
    );
  }
  if (raw.length > 2048) {
    throw new ValidationError("URL is too long", "INVALID_URL");
  }

  // Reject nonsense with no structure (spaces, only punctuation, etc.)
  if (/\s/.test(raw)) {
    throw new ValidationError(
      "Enter a full website address, like example.com",
      "INVALID_URL"
    );
  }

  if (/^(javascript|data|file|ftp|blob):/i.test(raw)) {
    throw new ValidationError("Unsupported URL scheme", "BAD_SCHEME");
  }

  // Do not invent TLDs — only prepend scheme if missing
  if (!/^https?:\/\//i.test(raw)) {
    raw = "https://" + raw;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError(
      "Enter a full website address, like example.com",
      "INVALID_URL"
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Only http and https URLs are allowed", "BAD_SCHEME");
  }

  url.username = "";
  url.password = "";
  url.hash = "";

  assertSafeHostname(url.hostname);
  assertPlausiblePublicHost(url.hostname);
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
  assertPlausiblePublicHost(url.hostname);
  return url;
}

function assertSafeHostname(hostname) {
  const host = (hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host) throw new ValidationError("Empty hostname", "SSRF");

  if (host.length > 253) {
    throw new ValidationError("Hostname is too long", "INVALID_URL");
  }

  if (BLOCKED_HOSTS.has(host)) {
    throw new ValidationError("Scanning this host is not allowed", "SSRF");
  }

  if (
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host.endsWith(".home")
  ) {
    throw new ValidationError("Internal hostnames are blocked", "SSRF");
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    for (const re of PRIVATE_V4) {
      if (re.test(host)) {
        throw new ValidationError(
          "Private or reserved IP addresses are blocked",
          "SSRF"
        );
      }
    }
  }

  if (host.includes(":")) {
    for (const re of PRIVATE_V6) {
      if (re.test(host)) {
        throw new ValidationError("Private IPv6 addresses are blocked", "SSRF");
      }
    }
  }

  if (/^0x[0-9a-f]+$/i.test(host) || /^\d{8,}$/.test(host)) {
    throw new ValidationError("Numeric host encodings are blocked", "SSRF");
  }
}

/**
 * Require a real-looking public hostname (dot + plausible TLD).
 * Does not append .com to bare words.
 */
function assertPlausiblePublicHost(hostname) {
  const host = (hostname || "").toLowerCase().replace(/\.$/, "");

  // Public IPv4 is allowed if not private (already checked)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return;
  }

  // IPv6 literals handled in assertSafeHostname
  if (host.includes(":")) return;

  // Must contain a dot — reject "hello", "localhost" already blocked
  if (!host.includes(".")) {
    throw new ValidationError(
      "Enter a full website address, like example.com",
      "INVALID_URL"
    );
  }

  const labels = host.split(".");
  if (labels.some((l) => !l || l.length > 63)) {
    throw new ValidationError(
      "Enter a full website address, like example.com",
      "INVALID_URL"
    );
  }

  // DNS label charset
  if (!/^[a-z0-9.-]+$/i.test(host) || host.includes("..")) {
    throw new ValidationError(
      "Enter a full website address, like example.com",
      "INVALID_URL"
    );
  }

  const tld = labels[labels.length - 1];
  // TLD: at least 2 chars, letters only (IDN punycode xn-- allowed on labels)
  const tldOk =
    (/^[a-z]{2,24}$/i.test(tld) || /^xn--[a-z0-9-]{2,}$/i.test(tld));

  if (!tldOk) {
    throw new ValidationError(
      "Enter a full website address, like example.com",
      "INVALID_URL"
    );
  }

  // Need a name before the public suffix
  if (labels.length < 2) {
    throw new ValidationError(
      "Enter a full website address, like example.com",
      "INVALID_URL"
    );
  }

  // e.g. co.uk must be preceded by another label
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_TLD.has(lastTwo) && labels.length < 3) {
    throw new ValidationError(
      "Enter a full website address, like example.com",
      "INVALID_URL"
    );
  }
}

export function displayHost(url) {
  return url.hostname.replace(/^www\./, "");
}
