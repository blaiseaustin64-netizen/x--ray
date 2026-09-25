/**
 * Modular scanner registry.
 * Each scanner: (evidence, ctx) => Promise<{ id, findings[], scores{}, incomplete? }>
 * One slow/failed scanner must not kill the whole scan.
 */

import { scanTitle } from "./title.js";
import { scanMeta } from "./meta.js";
import { scanHeadings } from "./headings.js";
import { scanCanonical } from "./canonical.js";
import { scanRobots } from "./robots.js";
import { scanSitemap } from "./sitemap.js";
import { scanImages } from "./images.js";
import { scanLinks } from "./links.js";
import { scanViewport } from "./viewport.js";
import { scanHttps } from "./https.js";
import { scanHeaders } from "./headers.js";
import { scanHttp } from "./http.js";

const REGISTRY = [
  scanTitle,
  scanMeta,
  scanHeadings,
  scanCanonical,
  scanRobots,
  scanSitemap,
  scanImages,
  scanLinks,
  scanViewport,
  scanHttps,
  scanHeaders,
  scanHttp,
];

const SCANNER_TIMEOUT_MS = 3500;

/**
 * Run all scanners with per-scanner timeout isolation.
 */
export async function runAllScanners(evidence, ctx = {}) {
  const results = [];

  await Promise.all(
    REGISTRY.map(async (fn) => {
      const id = fn.scannerId || fn.name || "unknown";
      try {
        const result = await withTimeout(fn(evidence, ctx), SCANNER_TIMEOUT_MS);
        results.push({ id, ...result, ok: true });
      } catch (err) {
        results.push({
          id,
          ok: false,
          incomplete: true,
          error: err.message || "Scanner timed out or failed",
          findings: [],
          scores: {},
        });
      }
    })
  );

  return results;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Scanner timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
