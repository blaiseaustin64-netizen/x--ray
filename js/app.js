/**
 * VEXDYN X-Ray — Application controller
 * Orchestrates idle → scanning → results, plus local scan history.
 */

import { runScan } from "./scanner/engine.js";
import { createScanView } from "./ui/scan-view.js";
import { createResultsView } from "./ui/results-view.js";
import {
  initHistoryStorage,
  isHistoryAvailable,
  saveScan,
  scoresForHost,
} from "./history/storage.js";
import {
  createHistoryPanel,
  relativeTime,
  formatFullDate,
} from "./ui/history-panel.js";

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
  const rescanLabel = $("[data-rescan-label]");
  const shareBtn = $("[data-share]");
  const backBtn = $("[data-results-back]");
  const toast = $("[data-toast]");
  const urlError = $("[data-url-error]");
  const savedBanner = $("[data-saved-banner]");

  const scanView = createScanView(app);
  const resultsView = createResultsView(app);

  let abortController = null;
  let currentReport = null;
  /** @type {'live'|'saved'|null} */
  let resultsMode = null;
  let viewingEntry = null;

  const historyPanel = createHistoryPanel(document, {
    onOpenEntry: (entry) => openSavedEntry(entry),
  });

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

  function setSavedBanner(entry, scoreDelta) {
    if (!savedBanner) return;
    if (!entry) {
      savedBanner.classList.remove("visible");
      savedBanner.innerHTML = "";
      return;
    }
    const rel = relativeTime(entry.timestamp);
    const full = formatFullDate(entry.timestamp);
    let deltaHtml = "";
    if (typeof scoreDelta === "number") {
      const cls = scoreDelta >= 0 ? "up" : "down";
      const sign = scoreDelta >= 0 ? "+" : "";
      deltaHtml = ` <span class="saved-delta ${cls}">${sign}${scoreDelta} vs previous</span>`;
    }
    savedBanner.innerHTML = `<strong>Saved scan</strong> — scanned ${escapeHtml(
      rel
    )} — ${escapeHtml(full)}${deltaHtml}`;
    savedBanner.classList.add("visible");
  }

  function prefersReducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  async function openSavedEntry(entry) {
    if (!entry?.report) return;
    viewingEntry = entry;
    resultsMode = "saved";
    currentReport = entry.report;

    if (rescanLabel) rescanLabel.textContent = "Re-scan";

    showView("scanning");
    scanView.start();
    scanView.setStatus("Restoring saved scan…");

    if (prefersReducedMotion()) {
      await sleep(280);
    } else {
      // Compact restore animation ~1.4s
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        scanView.setProgress(Math.round((i / steps) * 100));
        await sleep(100);
      }
    }

    scanView.stop();
    scanView.setProgress(100);
    resultsView.render(entry.report);
    setSavedBanner(entry);
    showView("results");
  }

  async function startScan(urlOverride) {
    const url = (urlOverride ?? urlInput?.value ?? "").trim();
    if (!url) {
      setUrlError(true);
      urlInput?.focus();
      return;
    }
    setUrlError(false);
    setSavedBanner(null);
    viewingEntry = null;
    resultsMode = "live";
    if (rescanLabel) rescanLabel.textContent = "Scan again";

    const prevScores = isHistoryAvailable()
      ? await scoresForHost(url, 2)
      : [];

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
      resultsMode = "live";
      scanView.stop();
      scanView.setProgress(100);
      scanView.setStatus("complete");

      // Save successful scan only
      let scoreDelta = null;
      if (isHistoryAvailable()) {
        try {
          await saveScan(report);
          if (prevScores.length >= 1 && typeof report.overallScore === "number") {
            scoreDelta = report.overallScore - prevScores[0];
          }
          historyPanel.refresh?.();
        } catch {
          /* storage must never break scanning */
        }
      }

      await sleep(450);
      resultsView.render(report);
      if (scoreDelta != null && prevScores.length >= 1) {
        // Brief note on live rescan of same host
        if (savedBanner && Math.abs(scoreDelta) > 0) {
          const cls = scoreDelta >= 0 ? "up" : "down";
          const sign = scoreDelta >= 0 ? "+" : "";
          savedBanner.innerHTML = `<strong>Fresh scan</strong> — score ${
            report.overallScore
          } <span class="saved-delta ${cls}">${sign}${scoreDelta} vs previous</span>`;
          savedBanner.classList.add("visible");
        } else {
          setSavedBanner(null);
        }
      } else {
        setSavedBanner(null);
      }
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
    if (resultsMode === "saved" && viewingEntry) {
      // Re-scan: real API scan of same URL
      const url = viewingEntry.url || viewingEntry.report?.url || "";
      if (urlInput) urlInput.value = url;
      startScan(url);
      return;
    }
    showView("idle");
    scanView.reset();
    setSavedBanner(null);
    viewingEntry = null;
    if (urlInput) {
      urlInput.focus();
      urlInput.select();
    }
  }

  function goBack() {
    showView("idle");
    scanView.reset();
    setSavedBanner(null);
    viewingEntry = null;
    resultsMode = null;
    if (rescanLabel) rescanLabel.textContent = "Scan again";
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
  scanBtn?.addEventListener("click", () => startScan());
  urlInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startScan();
  });
  urlInput?.addEventListener("input", () => setUrlError(false));
  scanAgainBtn?.addEventListener("click", scanAgain);
  backBtn?.addEventListener("click", goBack);
  shareBtn?.addEventListener("click", shareReport);

  // Initial
  showView("idle");
  scanView.reset();

  initHistoryStorage()
    .then(() => {
      historyPanel.setVisible(isHistoryAvailable());
      if (isHistoryAvailable()) historyPanel.refresh();
    })
    .catch(() => {
      historyPanel.setVisible(false);
    });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
