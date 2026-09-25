/**
 * Aggregate scanner scores → overall + category scores matching the UI.
 */

const CATEGORY_META = [
  { id: "performance", name: "Performance", key: "performance" },
  { id: "seo", name: "SEO", key: "seo" },
  { id: "accessibility", name: "A11y", key: "accessibility" },
  { id: "mobile", name: "Mobile", key: "mobile" },
  { id: "security", name: "Security", key: "security" },
  { id: "design", name: "Design", key: "design" },
];

/**
 * @param {Array} scannerResults
 */
export function aggregateScores(scannerResults) {
  const buckets = {
    performance: [],
    seo: [],
    accessibility: [],
    mobile: [],
    security: [],
    design: [],
  };

  for (const r of scannerResults) {
    const scores = r.scores || {};
    for (const [k, v] of Object.entries(scores)) {
      if (typeof v === "number" && buckets[k]) buckets[k].push(v);
    }
  }

  // Design has no real scanner yet — neutral baseline from available signals
  if (buckets.design.length === 0) {
    const seoAvg = avg(buckets.seo) ?? 60;
    const a11yAvg = avg(buckets.accessibility) ?? 60;
    buckets.design.push(Math.round((seoAvg + a11yAvg) / 2));
  }

  // Defaults when a category had no scanners
  for (const key of Object.keys(buckets)) {
    if (buckets[key].length === 0) buckets[key].push(60);
  }

  const categories = CATEGORY_META.map((c) => {
    const score = Math.round(avg(buckets[c.key]));
    return {
      id: c.id,
      name: c.name,
      score,
      level: levelFor(score),
    };
  });

  // Weighted overall
  const weights = {
    seo: 0.25,
    security: 0.2,
    performance: 0.2,
    accessibility: 0.15,
    mobile: 0.12,
    design: 0.08,
  };

  let overall = 0;
  for (const c of categories) {
    overall += c.score * (weights[c.id] || 0);
  }
  overall = Math.round(overall);

  return {
    overallScore: overall,
    verdict: verdictFor(overall),
    verdictLevel: levelFor(overall),
    categories,
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
