export async function scanHeadings(evidence) {
  const findings = [];
  let score = 100;
  const { h1, h2, h3 } = evidence;

  if (!h1 || h1.length === 0) {
    findings.push({
      id: "h1-missing",
      severity: "attention",
      category: "SEO",
      title: "No H1 heading found",
      badge: "Needs attention",
      why: "Pages without a clear H1 are harder for users and crawlers to understand.",
      fix: "Add a single primary H1 that matches the page intent.",
      evidence: { h1Count: 0 },
    });
    score = 35;
  } else if (h1.length > 1) {
    findings.push({
      id: "h1-multiple",
      severity: "opportunity",
      category: "SEO",
      title: `Multiple H1 headings (${h1.length})`,
      badge: "Opportunity",
      why: "Multiple H1s can dilute topical focus. One clear primary heading is preferred.",
      fix: "Keep a single H1; demote secondary headings to H2/H3.",
      evidence: { h1Count: h1.length, h1 },
    });
    score = 70;
  } else {
    findings.push({
      id: "h1-ok",
      severity: "healthy",
      category: "SEO",
      title: "Single H1 present",
      badge: "Healthy",
      why: `H1: "${h1[0].slice(0, 100)}${h1[0].length > 100 ? "…" : ""}"`,
      fix: "Ensure the H1 stays unique and descriptive across pages.",
      evidence: { h1: h1[0] },
    });
  }

  if ((h2?.length || 0) === 0 && (h3?.length || 0) === 0) {
    findings.push({
      id: "headings-flat",
      severity: "opportunity",
      category: "SEO",
      title: "Little heading structure below H1",
      badge: "Opportunity",
      why: "No H2/H3 headings detected. Structured headings help scanning and SEO.",
      fix: "Break content into sections with descriptive H2s.",
      evidence: { h2Count: h2?.length || 0, h3Count: h3?.length || 0 },
    });
    score = Math.min(score, 65);
  }

  return { findings, scores: { seo: score } };
}
scanHeadings.scannerId = "headings";
