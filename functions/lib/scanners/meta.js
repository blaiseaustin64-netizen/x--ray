export async function scanMeta(evidence) {
  const findings = [];
  let score = 100;
  const desc = evidence.metaDescription;

  if (!desc) {
    findings.push({
      id: "meta-desc-missing",
      severity: "attention",
      category: "SEO",
      title: "Missing meta description",
      badge: "Needs attention",
      why: "No meta description was found. Search engines may invent a snippet from page text.",
      fix: "Add a unique meta description of 120–160 characters that summarizes the page and includes a call to action.",
      evidence: { metaDescription: null },
    });
    score = 25;
  } else if (desc.length < 50) {
    findings.push({
      id: "meta-desc-short",
      severity: "attention",
      category: "SEO",
      title: "Meta description is short",
      badge: "Needs attention",
      why: `Description is only ${desc.length} characters. Longer, specific snippets usually get better CTR.`,
      fix: "Expand to roughly 120–160 characters with a clear benefit statement.",
      evidence: { metaDescription: desc, length: desc.length },
    });
    score = 55;
  } else if (desc.length > 170) {
    findings.push({
      id: "meta-desc-long",
      severity: "opportunity",
      category: "SEO",
      title: "Meta description may be truncated",
      badge: "Opportunity",
      why: `Description is ${desc.length} characters; SERPs often cut past ~155–160.`,
      fix: "Front-load the key message in the first 150 characters.",
      evidence: { metaDescription: desc, length: desc.length },
    });
    score = 80;
  } else {
    findings.push({
      id: "meta-desc-ok",
      severity: "healthy",
      category: "SEO",
      title: "Meta description present",
      badge: "Healthy",
      why: `Meta description looks usable (${desc.length} chars).`,
      fix: "A/B test snippet wording for click-through rate over time.",
      evidence: { metaDescription: desc, length: desc.length },
    });
  }

  // Open Graph soft check
  if (!evidence.ogTitle && !evidence.ogDescription) {
    findings.push({
      id: "og-missing",
      severity: "opportunity",
      category: "SEO",
      title: "Open Graph tags not detected",
      badge: "Opportunity",
      why: "No og:title / og:description found. Social shares may look plain.",
      fix: "Add og:title, og:description, and og:image for key pages.",
      evidence: { ogTitle: evidence.ogTitle, ogDescription: evidence.ogDescription },
    });
    score = Math.min(score, score - 10);
  }

  return { findings, scores: { seo: Math.max(0, score) } };
}
scanMeta.scannerId = "meta";
