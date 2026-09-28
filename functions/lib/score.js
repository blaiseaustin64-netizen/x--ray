/**
 * Aggregate scanner scores → overall + category scores matching the UI.
 * Incomplete / missing scanners are excluded — never treated as a pass.
 */

import { ScanError } from "./validate.js";

const CATEGORY_META = [
  { id: "performance", name: "Performance", key: "performance" },
  { id: "seo", name: "SEO", key: "seo" },
  { id: "accessibility", name: "A11y", key: "accessibility" },
  { id: "mobile", name: "Mobile", key: "mobile" },
  { id: "security", name: "Security", key: "security" },
  { id: "design", name: "Design", key: "design" },
];

/** Minimum scanners that must return real evidence before we score */
export const MIN_EVIDENCE_SCANNERS = 3;

/**
 * @param {Array} scannerResults
 * @param {{ requireEvidence?: boolean }} [opts]
 */
export function aggregateScores(scannerResults, opts = {}) {
  const requireEvidence = opts.requireEvidence !== false;

  const buckets = {
    performance: [],
    seo: [],
    accessibility: [],
    mobile: [],
    security: [],
    design: [],
  };

  let completed = 0;

  for (const r of scannerResults) {
    if (!r || r.incomplete || r.ok === false) continue;
    // Must have produced at least one finding or a numeric score from real work
    const scores = r.scores || {};
    const hasScore = Object.values(scores).some((v) => typeof v === "number");
    const hasFindings = Array.isArray(r.findings) && r.findings.length > 0;
    if (!hasScore && !hasFindings) continue;

    completed += 1;
    for (const [k, v] of Object.entries(scores)) {
      if (typeof v === "number" && buckets[k]) buckets[k].push(v);
    }
  }

  if (requireEvidence && completed < MIN_EVIDENCE_SCANNERS) {
    throw new ScanError(
      "Not enough evidence was collected to score this site. The page may be empty or blocked.",
      "INSUFFICIENT_EVIDENCE",
      422
    );
  }

  // Design: only derive if we have real SEO or a11y evidence — never invent 60
  if (buckets.design.length === 0) {
    const seoAvg = avg(buckets.seo);
    const a11yAvg = avg(buckets.accessibility);
    if (seoAvg != null || a11yAvg != null) {
      const parts = [seoAvg, a11yAvg].filter((n) => n != null);
      buckets.design.push(Math.round(parts.reduce((a, b) => a + b, 0) / parts.length));
    }
  }

  const categories = CATEGORY_META.map((c) => {
    const values = buckets[c.key];
    if (!values || values.length === 0) {
      return {
        id: c.id,
        name: c.name,
        score: null,
        level: "muted",
        notChecked: true,
      };
    }
    const score = Math.round(avg(values));
    return {
      id: c.id,
      name: c.name,
      score,
      level: levelFor(score),
      notChecked: false,
    };
  });

  const scored = categories.filter((c) => !c.notChecked && typeof c.score === "number");
  if (requireEvidence && scored.length === 0) {
    throw new ScanError(
      "Not enough evidence was collected to score this site.",
      "INSUFFICIENT_EVIDENCE",
      422
    );
  }

  // Weighted overall over categories that actually ran
  const weights = {
    seo: 0.25,
    security: 0.2,
    performance: 0.2,
    accessibility: 0.15,
    mobile: 0.12,
    design: 0.08,
  };

  let weightSum = 0;
  let overall = 0;
  for (const c of scored) {
    const w = weights[c.id] || 0.1;
    overall += c.score * w;
    weightSum += w;
  }
  overall = weightSum > 0 ? Math.round(overall / weightSum) : null;

  if (overall == null) {
    throw new ScanError(
      "Not enough evidence was collected to score this site.",
      "INSUFFICIENT_EVIDENCE",
      422
    );
  }

  return {
    overallScore: overall,
    verdict: verdictFor(overall),
    verdictLevel: levelFor(overall),
    categories,
    completedScanners: completed,
  };
}

function avg(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function levelFor(score) {
  if (score >= 80) return "good";
  if (score >= 55) return "warn";
  return "danger";
}

function verdictFor(score) {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Good";
  if (score >= 55) return "Needs attention";
  if (score >= 40) return "Weak";
  return "Critical issues";
}
