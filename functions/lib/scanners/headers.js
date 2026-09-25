const SECURITY_HEADERS = [
  {
    name: "strict-transport-security",
    label: "HSTS",
    severity: "attention",
    why: "HSTS tells browsers to only use HTTPS, reducing SSL-stripping risk.",
    fix: "Add Strict-Transport-Security: max-age=31536000; includeSubDomains",
  },
  {
    name: "content-security-policy",
    label: "Content-Security-Policy",
    severity: "opportunity",
    why: "CSP mitigates XSS by controlling which scripts and resources can load.",
    fix: "Start with a report-only CSP, then enforce a tight policy.",
  },
  {
    name: "x-content-type-options",
    label: "X-Content-Type-Options",
    severity: "opportunity",
    why: "nosniff prevents MIME-type sniffing attacks.",
    fix: "Add X-Content-Type-Options: nosniff",
  },
  {
    name: "x-frame-options",
    label: "X-Frame-Options",
    severity: "opportunity",
    why: "Helps prevent clickjacking by controlling framing.",
    fix: "Add X-Frame-Options: DENY or SAMEORIGIN (or use CSP frame-ancestors).",
  },
  {
    name: "referrer-policy",
    label: "Referrer-Policy",
    severity: "opportunity",
    why: "Controls how much referrer information is sent with requests.",
    fix: "Add Referrer-Policy: strict-origin-when-cross-origin (or stricter).",
  },
];

export async function scanHeaders(evidence) {
  const findings = [];
  const headers = evidence.headers || {};
  let score = 100;
  let missingWeight = 0;

  for (const h of SECURITY_HEADERS) {
    if (!headers[h.name]) {
      findings.push({
        id: `header-missing-${h.name}`,
        severity: h.severity,
        category: "Security",
        title: `Missing ${h.label}`,
        badge: h.severity === "attention" ? "Needs attention" : "Opportunity",
        why: h.why,
        fix: h.fix,
        evidence: { header: h.name, present: false },
      });
      missingWeight += h.severity === "attention" ? 18 : 8;
    }
  }

  const present = SECURITY_HEADERS.filter((h) => headers[h.name]).map((h) => h.label);
  if (present.length === SECURITY_HEADERS.length) {
    findings.push({
      id: "headers-strong",
      severity: "healthy",
      category: "Security",
      title: "Core security headers present",
      badge: "Healthy",
      why: `Found: ${present.join(", ")}`,
      fix: "Review CSP periodically as third-party scripts change.",
      evidence: { present },
    });
  } else if (present.length > 0) {
    findings.push({
      id: "headers-partial",
      severity: "opportunity",
      category: "Security",
      title: "Some security headers present",
      badge: "Opportunity",
      why: `Present: ${present.join(", ") || "none"}. Others still missing.`,
      fix: "Add the remaining headers listed in this report.",
      evidence: { present, missing: SECURITY_HEADERS.length - present.length },
    });
  }

  score = Math.max(20, 100 - missingWeight);
  return { findings, scores: { security: score } };
}
scanHeaders.scannerId = "headers";
