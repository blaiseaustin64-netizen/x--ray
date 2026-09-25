export async function scanHttps(evidence) {
  const findings = [];
  let score = 100;
  let finalUrl = evidence.finalUrl || "";

  let isHttps = false;
  try {
    isHttps = new URL(finalUrl).protocol === "https:";
  } catch {
    isHttps = /^https:/i.test(finalUrl);
  }

  if (!isHttps) {
    findings.push({
      id: "https-missing",
      severity: "critical",
      category: "Security",
      title: "Page not served over HTTPS",
      badge: "Critical",
      why: "The final URL uses HTTP. Browsers mark these sites as not secure; SEO and trust suffer.",
      fix: "Install a TLS certificate, redirect all HTTP traffic to HTTPS, and enable HSTS.",
      evidence: { finalUrl },
    });
    score = 10;
  } else {
    findings.push({
      id: "https-ok",
      severity: "healthy",
      category: "Security",
      title: "HTTPS in use",
      badge: "Healthy",
      why: `Final URL is HTTPS: ${finalUrl}`,
      fix: "Enable HSTS and ensure mixed-content (HTTP assets on HTTPS pages) is eliminated.",
      evidence: { finalUrl },
    });
  }

  // Mixed content heuristic: http:// assets in https page
  if (isHttps && evidence.images) {
    const mixed = evidence.images.filter((i) => /^http:\/\//i.test(i.src || ""));
    if (mixed.length > 0) {
      findings.push({
        id: "mixed-content-images",
        severity: "attention",
        category: "Security",
        title: "Possible mixed-content images",
        badge: "Needs attention",
        why: `${mixed.length} image src(s) use http:// on an HTTPS page.`,
        fix: "Serve all assets over HTTPS or use protocol-relative / root-relative URLs.",
        evidence: { samples: mixed.slice(0, 5).map((m) => m.src) },
      });
      score = Math.min(score, 55);
    }
  }

  return { findings, scores: { security: score } };
}
scanHttps.scannerId = "https";
