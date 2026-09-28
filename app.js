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
  const urlError = $("[data-url-error]");

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
      scanBtn.textContent = busy ? "Scanning…" : "Scan →";
    }
    if (urlInput) urlInput.disabled = busy;
  }

  function setUrlError(show) {
    if (!urlError) return;
    urlError.classList.toggle("hidden", !show);
    if (urlInput) {
      urlInput.classList.toggle("has-error", !!show);
      urlInput.setAttribute("aria-invalid", show ? "true" : "false");
    }
  }

  // Typing placeholder lives only in index.html inline script (single instance).
  // Do not start a second loop here — that caused stutter / overlapping timers.

  async function startScan() {
    // Never use placeholder text — only the real input value
    const url = (urlInput?.value ?? "").trim();
    if (!url) {
      setUrlError(true);
      urlInput?.focus();
      return;
    }
    setUrlError(false);

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
      const msg =
        err?.message && err.message.length < 120
          ? err.message
          : "Scan failed. Check the URL and try again.";
      showToast(msg);
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
  urlInput?.addEventListener("input", () => setUrlError(false));
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
