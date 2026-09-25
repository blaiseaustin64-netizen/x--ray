export async function scanLinks(evidence) {
  const findings = [];
  const links = evidence.links || [];
  let score = 85;

  if (links.length === 0) {
    findings.push({
      id: "links-none",
      severity: "opportunity",
      category: "SEO",
      title: "No anchor links detected",
      badge: "Opportunity",
      why: "No <a href> links were found in the HTML. Internal linking helps discovery and rankings.",
      fix: "Add contextual internal links to related pages.",
      evidence: { count: 0 },
    });
    return { findings, scores: { seo: 50 } };
  }

  let pageHost = "";
  try {
    pageHost = new URL(evidence.finalUrl).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }

  let internal = 0;
  let external = 0;
  let nofollow = 0;

  for (const link of links) {
    const href = link.href || "";
    if (href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) continue;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) continue;

    try {
      const abs = new URL(href, evidence.finalUrl);
      const host = abs.hostname.replace(/^www\./, "");
      if (host === pageHost) internal += 1;
      else external += 1;
    } catch {
      /* skip bad href */
    }

    if (/\bnofollow\b/i.test(link.rel || "")) nofollow += 1;
  }

  findings.push({
    id: "links-summary",
    severity: "healthy",
    category: "SEO",
    title: "Link inventory",
    badge: "Healthy",
    why: `Detected ${links.length} anchors (~${internal} internal, ~${external} external${nofollow ? `, ${nofollow} nofollow` : ""}).`,
    fix: "Maintain a clear internal linking structure to important pages.",
    evidence: { total: links.length, internal, external, nofollow },
  });

  if (internal === 0 && external > 0) {
    findings.push({
      id: "links-no-internal",
      severity: "attention",
      category: "SEO",
      title: "No internal links detected",
      badge: "Needs attention",
      why: "Only external links were found. Internal links help distribute authority and guide crawlers.",
      fix: "Link to related pages on your own domain from body content.",
      evidence: { internal, external },
    });
    score = 45;
  }

  return { findings, scores: { seo: score } };
}
scanLinks.scannerId = "links";
