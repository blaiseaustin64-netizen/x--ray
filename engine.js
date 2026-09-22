/**
 * X-Ray Scanner Engine (modular)
 * --------------------------------
 * Currently returns structured demo data.
 * Later: swap createDemoReport for real API / multi-engine pipeline
 * without touching the UI layer.
 */

import { createDemoReport } from "../data/demo-scan.js";

/**
 * @typedef {Object} ScanOptions
 * @property {string} url
 * @property {(phase: string, progress: number) => void} [onProgress]
 * @property {(callout: object) => void} [onCallout]
 * @property {AbortSignal} [signal]
 */

/**
 * Run a full X-Ray scan.
 * Returns a Promise that resolves to the report object.
 */
export async function runScan({ url, onProgress, onCallout, signal } = {}) {
  const report = createDemoReport(url);
  const phases = report.phases;
  const callouts = report.scanCallouts;

  let totalMs = phases.reduce((s, p) => s + p.duration, 0);
  // Slight buffer so progress hits 100 cleanly
  totalMs += 200;

  let elapsed = 0;
  let calloutIndex = 0;

  for (const phase of phases) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    onProgress?.(phase.key, Math.min(99, Math.round((elapsed / totalMs) * 100)));

    const step = 50;
    const steps = Math.ceil(phase.duration / step);

    for (let i = 0; i < steps; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await sleep(step);
      elapsed += step;

      // Fire callouts on approximate timing
      while (
        calloutIndex < callouts.length &&
        callouts[calloutIndex].delay <= elapsed
      ) {
        onCallout?.(callouts[calloutIndex]);
        calloutIndex++;
      }

      const pct = Math.min(99, Math.round((elapsed / totalMs) * 100));
      onProgress?.(phase.key, pct);
    }
  }

  // Flush remaining callouts
  while (calloutIndex < callouts.length) {
    onCallout?.(callouts[calloutIndex]);
    calloutIndex++;
  }

  onProgress?.("complete", 100);
  await sleep(280);

  return report;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Future extension point:
 * registerEngine(name, fn) → multi-engine aggregation
 */
const engines = new Map();

export function registerEngine(name, fn) {
  engines.set(name, fn);
}

export function listEngines() {
  return Array.from(engines.keys());
}
