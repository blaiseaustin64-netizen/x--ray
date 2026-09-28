/**
 * History drawer / sidebar panel.
 */

import {
  listScans,
  deleteScan,
  clearAllScans,
  scoresForHost,
} from "../history/storage.js";

/**
 * @param {HTMLElement} root - #app or document body parent
 * @param {{ onOpenEntry: (entry) => void }} handlers
 */
export function createHistoryPanel(root, handlers = {}) {
  const panel = root.querySelector("[data-history-panel]");
  const backdrop = root.querySelector("[data-history-backdrop]");
  const listEl = root.querySelector("[data-history-list]");
  const searchEl = root.querySelector("[data-history-search]");
  const clearBtn = root.querySelector("[data-history-clear]");
  const closeBtn = root.querySelector("[data-history-close]");
  const openBtn = root.querySelector("[data-history-open]");
  const emptyEl = root.querySelector("[data-history-empty]");
  const confirmEl = root.querySelector("[data-history-confirm]");
  const confirmYes = root.querySelector("[data-history-confirm-yes]");
  const confirmNo = root.querySelector("[data-history-confirm-no]");

  let open = false;
  let entries = [];
  let query = "";

  async function refresh() {
    entries = await listScans();
    renderList();
  }

  function renderList() {
    if (!listEl) return;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entries.filter((e) => e.url.toLowerCase().includes(q))
      : entries;

    if (emptyEl) {
      emptyEl.hidden = filtered.length > 0 || q.length > 0;
      if (filtered.length === 0 && !q) {
        emptyEl.hidden = false;
      } else if (filtered.length === 0 && q) {
        emptyEl.hidden = true;
      }
    }

    if (filtered.length === 0) {
      listEl.innerHTML = q
        ? `<p class="history-no-results">No matches for “${escapeHtml(q)}”</p>`
        : "";
      return;
    }

    const groups = groupByRecency(filtered);
    const hostScoresCache = {};

    // Precompute trends synchronously from already-loaded entries
    const byHost = {};
    for (const e of entries) {
      const h = hostKey(e.url);
      if (!byHost[h]) byHost[h] = [];
      byHost[h].push(e.overallScore);
    }

    listEl.innerHTML = groups
      .map(({ label, items }) => {
        const rows = items
          .map((e) => {
            const host = hostKey(e.url);
            const scores = (byHost[host] || []).slice(0, 6);
            const trendHtml = scores.length >= 2 ? miniChart(scores) : "";
            const delta =
              scores.length >= 2 ? scores[0] - scores[1] : null;
            const deltaHtml =
              delta == null
                ? ""
                : `<span class="history-delta ${delta >= 0 ? "up" : "down"}">${
                    delta >= 0 ? "+" : ""
                  }${delta}</span>`;
            const level = levelFor(e.overallScore);
            return `
          <div class="history-entry" data-history-id="${escapeAttr(e.id)}">
            <button type="button" class="history-entry-main" data-history-open-id="${escapeAttr(
              e.id
            )}" aria-label="Open scan of ${escapeAttr(e.url)}, score ${
              e.overallScore
            }">
              <div class="history-score-ring ${level}" style="--pct:${
              e.overallScore
            }%">
                <span>${e.overallScore}</span>
              </div>
              <div class="history-entry-meta">
                <div class="history-host">${escapeHtml(e.url)}</div>
                <div class="history-time">${escapeHtml(
                  relativeTime(e.timestamp)
                )}${deltaHtml}</div>
                ${trendHtml}
              </div>
            </button>
            <button type="button" class="history-delete" data-history-delete="${escapeAttr(
              e.id
            )}" aria-label="Delete scan of ${escapeAttr(e.url)}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
            </button>
          </div>`;
          })
          .join("");
        return `<div class="history-group"><div class="history-group-label">${label}</div>${rows}</div>`;
      })
      .join("");
  }

  function openPanel() {
    open = true;
    panel?.classList.add("open");
    backdrop?.classList.add("open");
    panel?.setAttribute("aria-hidden", "false");
    openBtn?.setAttribute("aria-expanded", "true");
    document.body.classList.add("history-open");
    refresh();
    setTimeout(() => searchEl?.focus(), 80);
  }

  function closePanel() {
    open = false;
    panel?.classList.remove("open");
    backdrop?.classList.remove("open");
    panel?.setAttribute("aria-hidden", "true");
    openBtn?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("history-open");
    if (confirmEl) confirmEl.hidden = true;
    openBtn?.focus();
  }

  function toggle() {
    if (open) closePanel();
    else openPanel();
  }

  // Events
  openBtn?.addEventListener("click", toggle);
  closeBtn?.addEventListener("click", closePanel);
  backdrop?.addEventListener("click", closePanel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      closePanel();
    }
  });

  searchEl?.addEventListener("input", () => {
    query = searchEl.value || "";
    renderList();
  });

  listEl?.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-history-delete]");
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      const id = del.getAttribute("data-history-delete");
      await deleteScan(id);
      await refresh();
      return;
    }
    const openBtn = e.target.closest("[data-history-open-id]");
    if (openBtn) {
      const id = openBtn.getAttribute("data-history-open-id");
      const entry = entries.find((x) => x.id === id);
      if (entry) {
        closePanel();
        handlers.onOpenEntry?.(entry);
      }
    }
  });

  clearBtn?.addEventListener("click", () => {
    if (confirmEl) confirmEl.hidden = false;
  });
  confirmNo?.addEventListener("click", () => {
    if (confirmEl) confirmEl.hidden = true;
  });
  confirmYes?.addEventListener("click", async () => {
    await clearAllScans();
    if (confirmEl) confirmEl.hidden = true;
    await refresh();
  });

  return {
    open: openPanel,
    close: closePanel,
    refresh,
    setVisible(show) {
      if (openBtn) openBtn.hidden = !show;
    },
  };
}

function groupByRecency(items) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const buckets = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };

  for (const e of items) {
    const d = new Date(e.timestamp);
    if (d >= startOfToday) buckets.Today.push(e);
    else if (d >= startOfYesterday) buckets.Yesterday.push(e);
    else if (d >= startOfWeek) buckets["Previous 7 days"].push(e);
    else buckets.Older.push(e);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, items }));
}

function miniChart(scoresNewestFirst) {
  // scores newest first → chart left=oldest
  const scores = [...scoresNewestFirst].reverse().slice(-6);
  const max = Math.max(...scores, 1);
  const bars = scores
    .map((s) => {
      const h = Math.max(3, Math.round((s / max) * 18));
      return `<span class="history-bar" style="height:${h}px" title="${s}"></span>`;
    })
    .join("");
  return `<div class="history-trend" aria-hidden="true">${bars}</div>`;
}

function hostKey(u) {
  return String(u || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function levelFor(score) {
  if (score >= 80) return "good";
  if (score >= 55) return "warn";
  return "danger";
}

export function relativeTime(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatFullDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
