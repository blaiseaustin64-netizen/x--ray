/**
 * Demo scan payload — structured so real scanner engines can replace this later.
 * Shape mirrors what a production X-Ray API would return.
 */
export const DEMO_SCAN = {
  url: "yourbusiness.com",
  scannedAt: null, // set at runtime
  overallScore: 61,
  verdict: "Needs attention",
  verdictLevel: "warn", // good | warn | danger
  summary:
    "Your site loads slower than <strong>73% of competitors</strong> and Google can barely read it. Not great, not terrible — but definitely fixable.",
  tags: [
    { label: "🐢 Slow images", type: "warn" },
    { label: "🔍 Weak SEO", type: "warn" },
    { label: "🔒 SSL secure", type: "good" },
  ],
  categories: [
    { id: "performance", name: "Performance", score: 48, level: "danger" },
    { id: "seo", name: "SEO", score: 55, level: "warn" },
    { id: "accessibility", name: "A11y", score: 72, level: "warn" },
    { id: "mobile", name: "Mobile", score: 68, level: "warn" },
    { id: "security", name: "Security", score: 91, level: "good" },
    { id: "design", name: "Design", score: 64, level: "warn" },
  ],
  findings: [
    {
      id: "img-weight",
      severity: "critical",
      category: "Performance",
      title: "Unoptimized hero images",
      badge: "Critical",
      why: "Two images exceed 1.8 MB and are served as full-resolution JPEGs. This alone accounts for most of the 3.8 s load time on mobile.",
      fix: "Compress and convert to WebP/AVIF, serve responsive sizes with srcset, and lazy-load below-the-fold assets. Target under 200 KB per hero image.",
    },
    {
      id: "meta-missing",
      severity: "attention",
      category: "SEO",
      title: "Missing meta description & Open Graph",
      badge: "Needs attention",
      why: "Search engines and social platforms have no structured summary of the page. Click-through rates and share previews suffer.",
      fix: "Add a unique meta description (120–160 chars) and Open Graph tags (og:title, og:description, og:image) for every key page.",
    },
    {
      id: "ssl-ok",
      severity: "healthy",
      category: "Security",
      title: "Valid TLS certificate",
      badge: "Healthy",
      why: "HTTPS is correctly configured with a valid certificate and modern cipher suite. No mixed-content issues detected.",
      fix: "Keep certificates auto-renewing. Consider enabling HSTS and OCSP stapling for extra hardening.",
    },
    {
      id: "cls-layout",
      severity: "attention",
      category: "Performance",
      title: "Layout shift from late-loading fonts",
      badge: "Needs attention",
      why: "Custom fonts load after first paint, causing visible text reflow. Cumulative Layout Shift score is elevated.",
      fix: "Preload critical font files, use font-display: swap, and reserve space with size-adjust or fallback metrics.",
    },
    {
      id: "contrast",
      severity: "opportunity",
      category: "Accessibility",
      title: "Low contrast on secondary text",
      badge: "Opportunity",
      why: "Muted gray text on the dark background falls below WCAG AA contrast ratio in several places.",
      fix: "Raise secondary text luminance to at least 4.5:1 against the background. Prefer #b0b5be or lighter.",
    },
    {
      id: "mobile-tap",
      severity: "attention",
      category: "Mobile",
      title: "Tap targets too small",
      badge: "Needs attention",
      why: "Several interactive elements are under 44×44 px, making them hard to hit accurately on touch devices.",
      fix: "Increase padding on buttons and links so the hit area meets the 44 px minimum. Keep visual size flexible.",
    },
  ],
  /** Live callouts that appear during the beam sweep (demo only) */
  scanCallouts: [
    { id: "c1", label: "SEO", text: "Missing meta tags", type: "warn", delay: 700 },
    { id: "c2", label: "IMAGE", text: "2.1 MB unoptimized", type: "danger", delay: 1600 },
    { id: "c3", label: "SSL", text: "Valid & secure", type: "good", delay: 2600 },
    { id: "c4", label: "SPEED", text: "3.8 s load time", type: "warn", delay: 3600 },
    { id: "c5", label: "A11y", text: "Contrast issues", type: "info", delay: 4500 },
  ],
  phases: [
    { key: "scanning", label: "Scanning surface", duration: 1800 },
    { key: "analyzing", label: "Analyzing signals", duration: 2000 },
    { key: "revealing", label: "Revealing findings", duration: 1600 },
  ],
};

/**
 * Factory so each scan gets a fresh timestamp and optional URL override.
 */
export function createDemoReport(url = "yourbusiness.com") {
  return {
    ...DEMO_SCAN,
    url: normalizeUrl(url),
    scannedAt: new Date().toISOString(),
  };
}

function normalizeUrl(input) {
  let u = (input || "").trim().toLowerCase();
  if (!u) return "yourbusiness.com";
  u = u.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return u || "yourbusiness.com";
}
