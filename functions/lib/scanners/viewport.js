export async function scanViewport(evidence) {
  const findings = [];
  let score = 100;
  const vp = evidence.viewport;

  if (!vp) {
    findings.push({
      id: "viewport-missing",
      severity: "critical",
      category: "Mobile",
      title: "Missing viewport meta tag",
      badge: "Critical",
      why: "Without a viewport tag, mobile browsers may render a desktop layout zoomed out.",
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> in <head>.',
      evidence: { viewport: null },
    });
    score = 15;
  } else if (!/width\s*=\s*device-width/i.test(vp)) {
    findings.push({
      id: "viewport-weak",
      severity: "attention",
      category: "Mobile",
      title: "Viewport may not be mobile-friendly",
      badge: "Needs attention",
      why: `Viewport content is "${vp}" — missing width=device-width is a common mobile issue.`,
      fix: 'Prefer content="width=device-width, initial-scale=1".',
      evidence: { viewport: vp },
    });
    score = 50;
  } else {
    findings.push({
      id: "viewport-ok",
      severity: "healthy",
      category: "Mobile",
      title: "Mobile viewport configured",
      badge: "Healthy",
      why: `Viewport meta present: "${vp}"`,
      fix: "Avoid user-scalable=no unless you have a strong accessibility-reviewed reason.",
      evidence: { viewport: vp },
    });
  }

  return { findings, scores: { mobile: score } };
}
scanViewport.scannerId = "viewport";
