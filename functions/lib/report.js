/**
 * Build the frontend report shape from real evidence + scanner output.
 */

import { aggregateScores } from "./score.js";
import { displayHost } from "./validate.js";

const SEVERITY_ORDER = { critical: 0, attention: 1, opportunity: 2, healthy: 3 };

/**
 * @param {object} params
 * @param {URL} params.url
 * @param {object} params.evidence
 * @param {Array} params.scannerResults
 */
export function buildReport({ url, evidence, scannerResults }) {
  const { overallScore, verdict, verdictLevel, categories } =
    aggregateScores(scannerResults);

  const allFindings = [];
  const incomplete = [];

  for (const r of scannerResults) {
    if (r.incomplete) {
      incomplete.push(r.id);
    }
    for (const f of r.findings || []) {
      allFindings.push(f);
    }
  }

  // Prefer actionable findings first; keep a few healthy for balance
  allFindings.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  const findings = allFindings.slice(0, 16);

  const tags = buildTags(findings, evidence);
  const summary = buildSummary({
    overallScore,
    verdict,
    findings,
    evidence,
    incomplete,
  });

  // Live callouts for scan animation (derived from real findings)
  const scanCallouts = buildCallouts(findings, evidence);

  const host = displayHost(url);

  return {
    url: host,
    finalUrl: evidence.finalUrl,
    scannedAt: new Date().toISOString(),
    overallScore,
    verdict,
    verdictLevel,
    summary,
    tags,
    categories,
    findings,
    incompleteScanners: incomplete,
    evidence: {
      status: evidence.status,
      elapsedMs: evidence.elapsedMs,
      title: evidence.title,
      redirects: evidence.redirectChain?.length || 0,
    },
    scanCallouts,
    phases: [
      { key: "scanning", label: "Scanning surface", duration: 1200 },
      { key: "analyzing", label: "Analyzing signals", duration: 1400 },
      { key: "revealing", label: "Revealing findings", duration: 1000 },
    ],
  };
}

function buildTags(findings, evidence) {
  const tags = [];
  const has = (id) => findings.some((f) => f.id === id || f.id.startsWith(id));

  if (has("https-ok")) tags.push({ label: "🔒 HTTPS", type: "good" });
  if (has("https-missing")) tags.push({ label: "⚠️ Not HTTPS", type: "danger" });
  if (has("meta-desc-missing") || has("title-missing"))
    tags.push({ label: "🔍 SEO gaps", type: "warn" });
  if (has("images-missing-alt"))
    tags.push({ label: "♿ Alt text", type: "warn" });
  if (has("viewport-missing") || has("viewport-weak"))
    tags.push({ label: "📱 Mobile", type: "warn" });
  if (has("http-slow")) tags.push({ label: "🐢 Slow response", type: "warn" });
  if (has("robots-ok") && has("sitemap-ok"))
    tags.push({ label: "🗺 Crawlable", type: "good" });

  if (tags.length === 0) {
    tags.push({ label: "Scan complete", type: "good" });
  }
  return tags.slice(0, 4);
}

function buildSummary({ overallScore, verdict, findings, evidence, incomplete }) {
  const critical = findings.filter((f) => f.severity === "critical").length;
  const attention = findings.filter((f) => f.severity === "attention").length;
  const title = evidence.title
    ? `"${escapeHtml(evidence.title.slice(0, 60))}${evidence.title.length > 60 ? "…" : ""}"`
    : "this page";

  let line = `Scanned ${title} — score <strong>${overallScore}/100</strong> (${escapeHtml(verdict)}). `;

  if (critical > 0) {
    line += `Found <strong>${critical} critical</strong> issue${critical > 1 ? "s" : ""}`;
    if (attention) line += ` and ${attention} item${attention > 1 ? "s" : ""} needing attention`;
    line += ". ";
  } else if (attention > 0) {
    line += `${attention} item${attention > 1 ? "s" : ""} need attention. `;
  } else {
    line += "No critical issues detected in this pass. ";
  }

  if (incomplete?.length) {
    line += `Some checks incomplete: ${incomplete.join(", ")}.`;
  } else {
    line += "Every finding is tied to evidence from the live response.";
  }

  return line;
}

function buildCallouts(findings, evidence) {
  const picks = [];
  const push = (label, text, type) => {
    if (picks.length >= 5) return;
    picks.push({
      id: `c${picks.length + 1}`,
      label,
      text: text.slice(0, 40),
      type,
      delay: 600 + picks.length * 900,
    });
  };

  for (const f of findings) {
    if (f.severity === "healthy" && picks.length > 0) continue;
    const type =
      f.severity === "critical"
        ? "danger"
        : f.severity === "attention"
          ? "warn"
          : f.severity === "healthy"
            ? "good"
            : "info";
    push(f.category?.toUpperCase?.().slice(0, 8) || "SCAN", f.title, type);
    if (picks.length >= 5) break;
  }

  if (picks.length === 0) {
    push("HTTP", `Status ${evidence.status ?? "—"}`, "info");
  }
  return picks;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
