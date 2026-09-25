export async function scanImages(evidence) {
  const findings = [];
  const images = evidence.images || [];
  let a11yScore = 100;
  let perfScore = 85;

  if (images.length === 0) {
    findings.push({
      id: "images-none",
      severity: "healthy",
      category: "Accessibility",
      title: "No images detected on page",
      badge: "Healthy",
      why: "This page has no <img> tags in the HTML response (may still use CSS backgrounds).",
      fix: "If you add images later, include meaningful alt text.",
      evidence: { count: 0 },
    });
    return { findings, scores: { accessibility: 90, performance: perfScore } };
  }

  const missingAlt = images.filter((img) => !img.hasAltAttr);
  const emptyAlt = images.filter(
    (img) => img.hasAltAttr && (img.alt === "" || img.alt == null)
  );
  const withAlt = images.filter((img) => img.hasAltAttr && img.alt && img.alt.length > 0);

  if (missingAlt.length > 0) {
    const ratio = missingAlt.length / images.length;
    a11yScore = Math.max(15, Math.round(100 - ratio * 80));
    findings.push({
      id: "images-missing-alt",
      severity: missingAlt.length >= 3 || ratio > 0.3 ? "critical" : "attention",
      category: "Accessibility",
      title: `${missingAlt.length} image(s) missing alt attribute`,
      badge: missingAlt.length >= 3 || ratio > 0.3 ? "Critical" : "Needs attention",
      why: "Images without an alt attribute are invisible to screen readers and hurt accessibility scores.",
      fix: "Add descriptive alt text for informative images. Use alt=\"\" only for purely decorative images.",
      evidence: {
        total: images.length,
        missingAlt: missingAlt.length,
        samples: missingAlt.slice(0, 5).map((i) => i.src).filter(Boolean),
      },
    });
  }

  if (emptyAlt.length > 0 && missingAlt.length === 0) {
    findings.push({
      id: "images-empty-alt",
      severity: "opportunity",
      category: "Accessibility",
      title: `${emptyAlt.length} image(s) with empty alt`,
      badge: "Opportunity",
      why: "Empty alt is correct for decorative images, but confirm none of these convey meaning.",
      fix: "Review empty-alt images; add descriptive text if they carry information.",
      evidence: { emptyAlt: emptyAlt.length, total: images.length },
    });
    a11yScore = Math.min(a11yScore, 85);
  }

  if (withAlt.length === images.length) {
    findings.push({
      id: "images-alt-ok",
      severity: "healthy",
      category: "Accessibility",
      title: "All images declare alt attributes",
      badge: "Healthy",
      why: `${images.length} image(s) found; each has an alt attribute.`,
      fix: "Periodically audit alt quality (not just presence).",
      evidence: { total: images.length },
    });
  }

  // Lightweight perf signal: many images can mean weight issues (no byte sizes without extra fetches)
  if (images.length > 25) {
    findings.push({
      id: "images-many",
      severity: "opportunity",
      category: "Performance",
      title: `High image count (${images.length})`,
      badge: "Opportunity",
      why: "Large numbers of images often correlate with heavy pages. Byte sizes were not measured in this pass.",
      fix: "Lazy-load below-the-fold images, use modern formats (WebP/AVIF), and responsive srcset.",
      evidence: { count: images.length },
    });
    perfScore = 60;
  }

  return {
    findings,
    scores: { accessibility: a11yScore, performance: perfScore },
  };
}
scanImages.scannerId = "images";
