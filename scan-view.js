/**
 * Scan viewport controller — beam, callouts, status, progress.
 */

const CALLOUT_CLASS = {
  warn: "warn",
  danger: "danger",
  good: "good",
  info: "info",
};

export function createScanView(root) {
  const viewport = root.querySelector("[data-scan-viewport]");
  const statusEl = root.querySelector("[data-scan-status]");
  const phaseEl = root.querySelector("[data-scan-phase]");
  const progressBar = root.querySelector("[data-scan-progress]");
  const calloutEls = Array.from(root.querySelectorAll("[data-callout]"));

  function reset() {
    viewport?.classList.remove("is-scanning");
    calloutEls.forEach((el) => {
      el.classList.remove("visible", "fade-out");
      el.style.opacity = "";
    });
    if (progressBar) progressBar.style.width = "0%";
    setStatus("Ready", "");
  }

  function start() {
    reset();
    viewport?.classList.add("is-scanning");
    setStatus("Scanning", "SCANNING");
  }

  function setStatus(phaseKey, display) {
    const labels = {
      scanning: "SCANNING",
      analyzing: "ANALYZING",
      revealing: "REVEALING",
      complete: "COMPLETE",
    };
    if (statusEl) {
      const text = display || labels[phaseKey] || phaseKey.toUpperCase();
      statusEl.innerHTML = `<span class="dot"></span> ${text}`;
    }
    if (phaseEl) {
      const human = {
        scanning: "Reading page structure…",
        analyzing: "Correlating performance & SEO signals…",
        revealing: "Mapping findings to surface…",
        complete: "Diagnosis ready",
      };
      phaseEl.textContent = human[phaseKey] || "";
    }
  }

  function setProgress(pct) {
    if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function showCallout(callout) {
    const el = calloutEls.find((c) => c.dataset.callout === callout.id);
    if (!el) return;
    const type = CALLOUT_CLASS[callout.type] || "info";
    el.className = `callout ${type} ${callout.id}`;
    el.innerHTML = `<span class="label">${escapeHtml(callout.label)}</span>${escapeHtml(callout.text)}`;
    // Force reflow then reveal
    void el.offsetWidth;
    el.classList.add("visible");
  }

  function stop() {
    viewport?.classList.remove("is-scanning");
    calloutEls.forEach((el) => el.classList.add("fade-out"));
  }

  return { reset, start, setStatus, setProgress, showCallout, stop };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
