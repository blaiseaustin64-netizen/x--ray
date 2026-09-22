/**
 * VEXDYN X-Ray — Application controller
 * Orchestrates idle → scan → results views.
 * Scanner engines remain pluggable via js/scanner/engine.js
 */

import { runScan } from "./scanner/engine.js";
import { createScanView } from "./ui/scan-view.js";
import { createResultsView } from "./ui/results-view.js";

const $ = (sel, ctx = document) => ctx.querySelector(sel);

function init() {
  const app = $("#app");
  if (!app) return;

  const views = {
    idle: $("[data-view=idle]"),
    scanning: $("[data-view=scanning]"),
    results: $("[data-view=results]"),
  };

  const urlInput = $("[data-url-input]");
  const scanBtn = $("[data-scan-btn]");
  const scanAgainBtn = $("[data-scan-again]");
  const shareBtn = $("[data-share]");
  const toast = $("[data-toast]");

  const scanView = createScanView(app);
  const resultsView = createResultsView(app);

  let abortController = null;
  let currentReport = null;

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle("active", key === name);
    });
  }

  function setScanning(busy) {
    if (scanBtn) {
      scanBtn.disabled = busy;
      scanBtn.innerHTML = busy
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9" opacity="0.25"/><path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round"/></svg> Scanning`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg> Scan`;
    }
    if (urlInput) urlInput.disabled = busy;
  }

  async function startScan() {
    const url = (urlInput?.value || "yourbusiness.com").trim();
    if (!url) return;

    abortController?.abort();
    abortController = new AbortController();

    showView("scanning");
    setScanning(true);
    scanView.start();
    resultsView.clear();

    try {
      const report = await runScan({
        url,
        signal: abortController.signal,
        onProgress(phase, pct) {
          scanView.setStatus(phase);
          scanView.setProgress(pct);
        },
        onCallout(callout) {
          scanView.showCallout(callout);
        },
      });

      currentReport = report;
      scanView.stop();
      scanView.setProgress(100);
      scanView.setStatus("complete");

      // Brief beat before results
      await sleep(450);
      resultsView.render(report);
      showView("results");
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Scan failed", err);
      scanView.reset();
      showView("idle");
    } finally {
      setScanning(false);
    }
  }

  function scanAgain() {
    showView("idle");
    scanView.reset();
    if (urlInput) {
      urlInput.focus();
      urlInput.select();
    }
  }

  async function shareReport() {
    if (!currentReport) return;
    const text = `VEXDYN X-Ray · ${currentReport.url}\nScore: ${currentReport.overallScore}/100 — ${currentReport.verdict}\n\nScanned with VEXDYN X-Ray`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `X-Ray Report — ${currentReport.url}`,
          text,
        });
      } else {
        await navigator.clipboard.writeText(text);
        showToast("Report copied to clipboard");
      }
    } catch (e) {
      // User cancelled share — ignore
      if (e.name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(text);
          showToast("Report copied to clipboard");
        } catch {
          showToast("Unable to share");
        }
      }
    }
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  // Events
  scanBtn?.addEventListener("click", startScan);
  urlInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startScan();
  });
  scanAgainBtn?.addEventListener("click", scanAgain);
  shareBtn?.addEventListener("click", shareReport);

  // Initial
  showView("idle");
  scanView.reset();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
