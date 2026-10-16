/**
 * Results / diagnose / fix renderer (pro layout).
 * Hooks used by app.js are unchanged: render(report) and clear().
 */

const FILTERS = [
  ["all", "All"],
  ["critical", "Critical"],
  ["attention", "Attention"],
  ["opportunity", "Opportunities"],
  ["healthy", "Healthy"],
];

import { listHistory, normalizeHost } from "../history/provider.js";
import { renderTrend, pointsFromEntries } from "./history-chart.js";

export function createResultsView(root) {
  const q = (sel) => root.querySelector(sel);
  const scoreNum = q("[data-score-num]");
  const scoreRing = q("[data-score-ring]");
  const scoreLabel = q("[data-score-label]");
  const scoreVerdict = q("[data-score-verdict]");
  const roastEl = q("[data-roast]");
  const tagsEl = q("[data-tags]");
  const categoriesEl = q("[data-categories]");
  const findingsEl = q("[data-findings]");
  const filtersEl = q("[data-filters]");
  const priorityEl = q("[data-priority]");
  const evidenceEl = q("[data-evidence]");
  const urlLabel = q("[data-result-url]");
  const printBtn = q("[data-print]");
  const trendEl = q("[data-trend]");
  let trendToken = 0;

  let findings = [];
  let filter = "all";

  // ---- Events (bound once, delegated) ------------------------------------
  printBtn?.addEventListener("click", () => window.print());

  filtersEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    filter = btn.dataset.filter;
    renderFilters();
    renderFindings();
  });

  findingsEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-finding-toggle]");
    if (!btn) return;
    const card = btn.closest(".finding");
    const open = card.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // ---- Render ------------------------------------------------------------
  function render(report) {
    findings = Array.isArray(report.findings) ? report.findings : [];
    filter = "all";

    if (urlLabel) urlLabel.textContent = report.url;

    animateScore(scoreNum, scoreRing, report.overallScore, report.verdictLevel);

    if (scoreLabel) scoreLabel.textContent = "out of 100";
    if (scoreVerdict) {
      scoreVerdict.textContent = report.verdict;
      scoreVerdict.className = `score-verdict ${report.verdictLevel}`;
    }

    // Summary is plain text (older saved reports may contain escaped HTML).
    if (roastEl) roastEl.textContent = plainText(report.summary);

    if (tagsEl) {
      tagsEl.innerHTML = (report.tags || [])
        .map((t) => `<span class="tag">${escapeHtml(t.label)}</span>`)
        .join("");
    }

    if (categoriesEl) {
      categoriesEl.innerHTML = (report.categories || [])
        .map((c) => {
          const notChecked = c.notChecked || c.score == null;
          const level = notChecked ? "muted" : c.level;
          const pct = notChecked ? 0 : Math.max(0, Math.min(100, Number(c.score) || 0));
          return `
        <div class="score-cat${notChecked ? " not-checked" : ""}">
          <div class="cat-score ${level}">${notChecked ? "—" : escapeHtml(c.score)}</div>
          <div class="cat-name">${escapeHtml(c.name)}${notChecked ? " · not checked" : ""}</div>
          ${
            notChecked
              ? ""
              : `<div class="cat-bar" aria-hidden="true"><span style="--w:${pct}%;--bar:var(--${level === "muted" ? "scan" : level})"></span></div>`
          }
        </div>`;
        })
        .join("");
    }

    renderFilters();
    renderFindings();
    renderPriority();
    renderEvidence(report);
    refreshTrend(report);
  }

  /** Bar chart of this site's scores over time (rises when improving, falls when not). */
  async function refreshTrend(report) {
    if (!trendEl) return;
    const token = ++trendToken;
    const host = normalizeHost(report.url);
    let entries = [];
    try {
      entries = (await listHistory()).filter((e) => normalizeHost(e.url) === host);
    } catch {
      entries = [];
    }
    if (token !== trendToken) return; // a newer render replaced this one
    if (!entries.length) {
      // History unavailable (private mode?) - still show this scan as the first bar.
      entries = [{ overallScore: report.overallScore, timestamp: report.scannedAt || new Date().toISOString(), verdictLevel: report.verdictLevel }];
    }
    renderTrend(trendEl, pointsFromEntries(entries), { host });
  }

  function renderFilters() {
    if (!filtersEl) return;
    const counts = { all: findings.length, critical: 0, attention: 0, opportunity: 0, healthy: 0 };
    for (const f of findings) if (f.severity in counts) counts[f.severity] += 1;
    filtersEl.innerHTML = FILTERS.filter(([k]) => k === "all" || counts[k] > 0)
      .map(
        ([k, label]) =>
          `<button type="button" class="rp-filter" data-filter="${k}" aria-pressed="${k === filter}">${label} ${counts[k]}</button>`
      )
      .join("");
  }

  function renderFindings() {
    if (!findingsEl) return;
    const list = filter === "all" ? findings : findings.filter((f) => f.severity === filter);
    findingsEl.innerHTML = list.length
      ? list.map((f, i) => findingCard(f, i === 0)).join("")
      : `<p class="rp-muted">No findings in this group.</p>`;
  }

  function renderPriority() {
    if (!priorityEl) return;
    const top = findings
      .filter((f) => f.severity === "critical" || f.severity === "attention")
      .slice(0, 3);
    priorityEl.innerHTML = top.length
      ? `<ol class="rp-list">${top
          .map(
            (f) =>
              `<li><span>${escapeHtml(f.title)}</span><em>${escapeHtml(f.category)}</em></li>`
          )
          .join("")}</ol>`
      : `<p class="rp-muted">No critical or attention items found in this pass.</p>`;
  }

  function renderEvidence(report) {
    if (!evidenceEl) return;
    const ev = report.evidence || {};
    const rows = [];
    if (ev.status != null) rows.push(["status", String(ev.status)]);
    if (ev.elapsedMs != null) rows.push(["fetch time", `${ev.elapsedMs} ms`]);
    if (ev.redirects != null) rows.push(["redirects", String(ev.redirects)]);
    if (ev.htmlBytes != null) rows.push(["html size", `${Math.max(1, Math.round(ev.htmlBytes / 1024))} KB`]);
    if (report.scannedAt) {
      const d = new Date(report.scannedAt);
      if (!Number.isNaN(d.getTime())) rows.push(["scanned", d.toLocaleString()]);
    }
    if (report.quota && typeof report.quota.remaining === "number") {
      rows.push(["scans left today", `${report.quota.remaining} of ${report.quota.limit}`]);
    }
    evidenceEl.innerHTML = rows
      .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`)
      .join("");
  }

  function clear() {
    findings = [];
    trendToken++;
    if (scoreNum) scoreNum.textContent = "0";
    if (scoreRing) {
      scoreRing.style.setProperty("--score-pct", "0%");
      scoreRing.style.setProperty("--score-color", "var(--scan)");
    }
  }

  return { render, clear };
}

function findingCard(f, defaultOpen = false) {
  const openClass = defaultOpen ? "is-open" : "";
  return `
    <div class="finding ${openClass}" data-finding-id="${escapeHtml(f.id)}">
      <button class="finding-header" type="button" data-finding-toggle aria-expanded="${defaultOpen}">
        <span class="finding-severity ${escapeHtml(f.severity)}"></span>
        <span class="finding-meta">
          <span class="finding-title">${escapeHtml(f.title)}</span>
          <span class="finding-tag">
            <span class="badge ${escapeHtml(f.severity)}">${escapeHtml(f.badge)}</span>
            ${escapeHtml(f.category)}
          </span>
        </span>
        <svg class="finding-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      <div class="finding-body">
        <div class="finding-why">
          <div class="finding-label">Why it matters</div>
          <div class="finding-text">${escapeHtml(f.why)}</div>
        </div>
        ${evidenceBlock(f)}
        <div class="finding-fix">
          <div class="finding-label">Recommended fix</div>
          <div class="finding-text">${escapeHtml(f.fix)}</div>
        </div>
      </div>
    </div>`;
}

/** Show real evidence the scanner captured (samples, snippets, present headers). */
function evidenceBlock(f) {
  const e = f.evidence || {};
  let lines = [];
  if (Array.isArray(e.samples) && e.samples.length) lines = e.samples.map(String);
  else if (typeof e.snippet === "string" && e.snippet) lines = [e.snippet.slice(0, 300)];
  else if (Array.isArray(e.present) && e.present.length) lines = [`Present: ${e.present.join(", ")}`];
  if (!lines.length) return "";
  return `
        <div class="finding-evidence">
          <div class="finding-label">Evidence</div>
          <pre class="finding-code">${escapeHtml(lines.slice(0, 6).join("\n"))}</pre>
        </div>`;
}

function animateScore(numEl, ringEl, target, level) {
  if (!numEl || !ringEl) return;

  const colors = {
    good: "var(--good)",
    warn: "var(--warn)",
    danger: "var(--danger)",
  };
  const color = colors[level] || "var(--scan)";
  ringEl.style.setProperty("--score-color", color);

  const duration = 1100;
  const start = performance.now();
  const from = 0;

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(from + (target - from) * eased);
    numEl.textContent = val;
    ringEl.style.setProperty("--score-pct", `${val}%`);
    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

/** Summary is plain text now; older saved reports contain escaped HTML. */
function plainText(s) {
  const doc = new DOMParser().parseFromString(String(s ?? ""), "text/html");
  return doc.documentElement.textContent || "";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
