/**
 * X-Ray Scanner Engine — client orchestrator
 * ------------------------------------------
 * Calls the real /api/scan endpoint while driving the cinematic
 * progress UI. No demo/fake findings — report comes from the server.
 */

/**
 * @typedef {Object} ScanOptions
 * @property {string} url
 * @property {(phase: string, progress: number) => void} [onProgress]
 * @property {(callout: object) => void} [onCallout]
 * @property {AbortSignal} [signal]
 */

/**
 * Run a full X-Ray scan against the live API.
 */
export async function runScan({ url, onProgress, onCallout, signal } = {}) {
  const phases = [
    { key: "scanning", label: "Scanning surface", weight: 0.35 },
    { key: "analyzing", label: "Analyzing signals", weight: 0.4 },
    { key: "revealing", label: "Revealing findings", weight: 0.25 },
  ];

  let phaseIndex = 0;
  let progress = 0;

  const tickProgress = () => {
    const phase = phases[Math.min(phaseIndex, phases.length - 1)];
    onProgress?.(phase.key, Math.min(92, Math.round(progress)));
  };

  // Soft progress while network request runs
  const progressTimer = setInterval(() => {
    if (progress < 88) {
      progress += progress < 40 ? 2.5 : progress < 70 ? 1.5 : 0.6;
      if (progress > 35 && phaseIndex < 1) phaseIndex = 1;
      if (progress > 65 && phaseIndex < 2) phaseIndex = 2;
      tickProgress();
    }
  }, 120);

  try {
    onProgress?.("scanning", 5);

    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });

    clearInterval(progressTimer);

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("Invalid response from scanner");
    }

    if (!res.ok) {
      const msg = data?.error || `Scan failed (${res.status})`;
      const err = new Error(msg);
      err.code = data?.code;
      err.status = res.status;
      throw err;
    }

    // Drive callouts from real findings
    const callouts = data.scanCallouts || [];
    for (const c of callouts) {
      onCallout?.(c);
      await sleep(180);
    }

    onProgress?.("revealing", 96);
    await sleep(200);
    onProgress?.("complete", 100);
    await sleep(200);

    // Ensure phases array exists for any UI that reads it
    if (!data.phases) data.phases = phases.map((p) => ({ ...p, duration: 1000 }));

    return data;
  } catch (err) {
    clearInterval(progressTimer);
    throw err;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extension point for additional client-side engines */
const engines = new Map();

export function registerEngine(name, fn) {
  engines.set(name, fn);
}

export function listEngines() {
  return Array.from(engines.keys());
}
