import { fetchTextResource } from "../extract.js";
import { assertSafeUrl } from "../validate.js";

export async function scanSitemap(evidence) {
  const findings = [];
  let score = 65;

  try {
    const origin = new URL(evidence.finalUrl).origin;
    const candidates = [
      new URL("/sitemap.xml", origin).toString(),
      new URL("/sitemap_index.xml", origin).toString(),
    ];

    let found = null;
    for (const url of candidates) {
      try {
        assertSafeUrl(url);
      } catch {
        continue;
      }
      const res = await fetchTextResource(url, 3500);
      if (res.ok && res.body && /<urlset|<sitemapindex/i.test(res.body)) {
        found = { url, status: res.status, bytes: res.body.length };
        break;
      }
    }

    if (!found) {
      findings.push({
        id: "sitemap-missing",
        severity: "attention",
        category: "SEO",
        title: "XML sitemap not detected",
        badge: "Needs attention",
        why: "No sitemap.xml or sitemap_index.xml with valid XML was found at common locations.",
        fix: "Generate an XML sitemap and submit it in Search Console; reference it from robots.txt.",
        evidence: { checked: candidates },
      });
      score = 40;
    } else {
      findings.push({
        id: "sitemap-ok",
        severity: "healthy",
        category: "SEO",
        title: "XML sitemap found",
        badge: "Healthy",
        why: `Sitemap reachable at ${found.url} (${found.bytes} bytes).`,
        fix: "Keep the sitemap updated as you publish or remove pages.",
        evidence: found,
      });
      score = 95;
    }
  } catch (err) {
    findings.push({
      id: "sitemap-error",
      severity: "opportunity",
      category: "SEO",
      title: "Sitemap check incomplete",
      badge: "Opportunity",
      why: err.message || "Sitemap check failed",
      fix: "Publish sitemap.xml at the site root.",
      evidence: { error: err.message },
    });
    score = 50;
  }

  return { findings, scores: { seo: score } };
}
scanSitemap.scannerId = "sitemap";
