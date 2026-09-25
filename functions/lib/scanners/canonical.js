export async function scanCanonical(evidence) {
  const findings = [];
  let score = 100;
  const canonical = evidence.canonical;
  const finalUrl = evidence.finalUrl;

  if (!canonical) {
    findings.push({
      id: "canonical-missing",
      severity: "opportunity",
      category: "SEO",
      title: "No canonical URL declared",
      badge: "Opportunity",
      why: "Without a canonical tag, search engines must infer the preferred URL, which can cause duplicate-content issues.",
      fix: "Add <link rel=\"canonical\" href=\"https://example.com/page\"> pointing to the preferred URL.",
      evidence: { canonical: null, finalUrl },
    });
    score = 60;
  } else {
    findings.push({
      id: "canonical-present",
      severity: "healthy",
      category: "SEO",
      title: "Canonical URL present",
      badge: "Healthy",
      why: `Canonical points to: ${canonical}`,
      fix: "Keep canonicals self-referencing on primary pages and consistent across variants.",
      evidence: { canonical, finalUrl },
    });
  }

  return { findings, scores: { seo: score } };
}
scanCanonical.scannerId = "canonical";
