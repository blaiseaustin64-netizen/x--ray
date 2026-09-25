export async function scanHttp(evidence) {
  const findings = [];
  const status = evidence.status;
  const elapsed = evidence.elapsedMs;
  let perfScore = 80;
  let seoScore = 90;

  if (status == null) {
    findings.push({
      id: "http-unknown",
      severity: "attention",
      category: "Performance",
      title: "HTTP status unknown",
      badge: "Needs attention",
      why: "Could not determine the HTTP status of the final response.",
      fix: "Verify the server returns a normal 200 for the homepage.",
      evidence: {},
    });
    return { findings, scores: { performance: 50, seo: 50 } };
  }

  if (status >= 400) {
    findings.push({
      id: "http-error",
      severity: "critical",
      category: "SEO",
      title: `HTTP error status ${status}`,
      badge: "Critical",
      why: `The final response status was ${status}. Error pages rarely rank or convert.`,
      fix: "Fix server/application errors so the primary URL returns 200.",
      evidence: { status, finalUrl: evidence.finalUrl },
    });
    seoScore = 10;
    perfScore = 30;
  } else if (status >= 300) {
    findings.push({
      id: "http-redirect-final",
      severity: "opportunity",
      category: "SEO",
      title: `Unexpected final status ${status}`,
      badge: "Opportunity",
      why: "Scan ended on a non-200 status after redirects.",
      fix: "Ensure the canonical URL resolves to HTTP 200.",
      evidence: { status, redirects: evidence.redirectChain },
    });
    seoScore = 60;
  } else {
    findings.push({
      id: "http-ok",
      severity: "healthy",
      category: "Performance",
      title: `HTTP ${status} response`,
      badge: "Healthy",
      why: `Server responded with ${status}${elapsed != null ? ` in ~${elapsed} ms (TTFB-ish fetch time)` : ""}.`,
      fix: "Monitor availability and keep response times stable under load.",
      evidence: {
        status,
        elapsedMs: elapsed,
        redirects: evidence.redirectChain?.length || 0,
        truncated: evidence.truncated,
      },
    });
  }

  if (elapsed != null) {
    if (elapsed > 5000) {
      findings.push({
        id: "http-slow",
        severity: "attention",
        category: "Performance",
        title: "Slow server response",
        badge: "Needs attention",
        why: `Document fetch took ~${elapsed} ms. Users and crawlers prefer faster responses.`,
        fix: "Improve server/TTFB with caching, CDN, and leaner origin responses.",
        evidence: { elapsedMs: elapsed },
      });
      perfScore = Math.min(perfScore, 40);
    } else if (elapsed > 2500) {
      findings.push({
        id: "http-moderate",
        severity: "opportunity",
        category: "Performance",
        title: "Moderate response time",
        badge: "Opportunity",
        why: `Document fetch took ~${elapsed} ms.`,
        fix: "Target sub-800 ms TTFB on key markets when possible.",
        evidence: { elapsedMs: elapsed },
      });
      perfScore = Math.min(perfScore, 65);
    }
  }

  if (evidence.truncated) {
    findings.push({
      id: "html-truncated",
      severity: "opportunity",
      category: "Performance",
      title: "HTML response truncated for analysis",
      badge: "Opportunity",
      why: "The HTML exceeded the scanner size limit; some late-page signals may be incomplete.",
      fix: "Reduce HTML payload size; avoid shipping huge inlined data in the document.",
      evidence: { htmlBytes: evidence.htmlBytes },
    });
  }

  return { findings, scores: { performance: perfScore, seo: seoScore } };
}
scanHttp.scannerId = "http";
