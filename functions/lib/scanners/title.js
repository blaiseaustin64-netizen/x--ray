export async function scanTitle(evidence) {
  const findings = [];
  let score = 100;
  const title = evidence.title;

  if (!title) {
    findings.push({
      id: "title-missing",
      severity: "critical",
      category: "SEO",
      title: "Missing page title",
      badge: "Critical",
      why: "No <title> element was found. Search engines and browser tabs have nothing descriptive to show.",
      fix: "Add a unique, descriptive <title> of roughly 50–60 characters that includes your primary keyword.",
      evidence: { title: null },
    });
    score = 0;
  } else if (title.length < 10) {
    findings.push({
      id: "title-short",
      severity: "attention",
      category: "SEO",
      title: "Title is very short",
      badge: "Needs attention",
      why: `Title is only ${title.length} characters ("${title}"). Short titles rarely rank or convert well.`,
      fix: "Expand the title to 50–60 characters with a clear value proposition.",
      evidence: { title, length: title.length },
    });
    score = 40;
  } else if (title.length > 70) {
    findings.push({
      id: "title-long",
      severity: "opportunity",
      category: "SEO",
      title: "Title may be truncated in SERPs",
      badge: "Opportunity",
      why: `Title is ${title.length} characters. Google often truncates beyond ~60 characters.`,
      fix: "Keep the most important words in the first 50–60 characters.",
      evidence: { title, length: title.length },
    });
    score = 75;
  } else {
    findings.push({
      id: "title-ok",
      severity: "healthy",
      category: "SEO",
      title: "Page title present",
      badge: "Healthy",
      why: `Title looks reasonable (${title.length} chars): "${title.slice(0, 80)}${title.length > 80 ? "…" : ""}"`,
      fix: "Keep titles unique per page and aligned with the primary query intent.",
      evidence: { title, length: title.length },
    });
  }

  return { findings, scores: { seo: score } };
}
scanTitle.scannerId = "title";
