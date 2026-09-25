import { fetchTextResource } from "../extract.js";
import { assertSafeUrl } from "../validate.js";

export async function scanRobots(evidence, ctx = {}) {
  const findings = [];
  let score = 70;
  let robotsBody = null;
  let status = 0;

  try {
    const origin = new URL(evidence.finalUrl).origin;
    const robotsUrl = new URL("/robots.txt", origin).toString();
    assertSafeUrl(robotsUrl);
    const res = await fetchTextResource(robotsUrl, 3500);
    status = res.status;
    robotsBody = res.body;

    if (!res.ok || !robotsBody) {
      findings.push({
        id: "robots-missing",
        severity: "opportunity",
        category: "SEO",
        title: "robots.txt not found or empty",
        badge: "Opportunity",
        why: `Could not retrieve a usable robots.txt (HTTP ${status || "n/a"}). Crawlers may still index, but you lose crawl control.`,
        fix: "Publish a robots.txt at the site root. Allow important paths and reference your sitemap.",
        evidence: { status, url: robotsUrl },
      });
      score = 50;
    } else {
      const hasSitemap = /sitemap:\s*\S+/i.test(robotsBody);
      const disallowsAll = /user-agent:\s*\*\s*[\s\S]*?disallow:\s*\/\s*$/im.test(
        robotsBody
      );

      if (disallowsAll) {
        findings.push({
          id: "robots-block-all",
          severity: "critical",
          category: "SEO",
          title: "robots.txt blocks all crawlers",
          badge: "Critical",
          why: "Disallow: / for User-agent: * will prevent search indexing.",
          fix: "Remove the blanket Disallow or narrow it to private paths only.",
          evidence: { status, snippet: robotsBody.slice(0, 400) },
        });
        score = 10;
      } else {
        findings.push({
          id: "robots-ok",
          severity: "healthy",
          category: "SEO",
          title: "robots.txt is reachable",
          badge: "Healthy",
          why: hasSitemap
            ? "robots.txt is present and references a sitemap."
            : "robots.txt is present. Consider adding a Sitemap: directive.",
          fix: hasSitemap
            ? "Review disallow rules periodically as the site grows."
            : "Add Sitemap: https://yoursite.com/sitemap.xml to robots.txt.",
          evidence: {
            status,
            bytes: robotsBody.length,
            hasSitemap,
            snippet: robotsBody.slice(0, 300),
          },
        });
        score = hasSitemap ? 95 : 80;
      }
    }
  } catch (err) {
    findings.push({
      id: "robots-error",
      severity: "opportunity",
      category: "SEO",
      title: "Could not check robots.txt",
      badge: "Opportunity",
      why: err.message || "robots.txt check failed",
      fix: "Ensure robots.txt is publicly reachable over HTTPS.",
      evidence: { error: err.message },
    });
    score = 55;
  }

  return { findings, scores: { seo: score } };
}
scanRobots.scannerId = "robots";
