/**
 * Animated score-history visuals.
 *  - renderTrend(): bar chart for one site (bars rise from 0; arrow moves up when
 *    the score improved, down when it dropped).
 *  - createHistoryDashboard(): "Your history" cards on the start screen.
 */

import { listHistory, normalizeHost } from "../history/provider.js";

export function levelFor(score) {
  if (score >= 80) return "good";
  if (score >= 55) return "warn";
  return "danger";
}

const LEVEL_LABEL = { good: "Good", warn: "Needs work", danger: "Poor" };

const ARROW = {
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  flat: '<path d="M5 12h14"/>',
};

function trendOf(points) {
  if (points.length < 2) return null;
  const latest = points[points.length - 1].score;
  const prev = points[points.length - 2].score;
  const delta = latest - prev;
  return { delta, dir: delta > 0 ? "up" : delta < 0 ? "down" : "flat" };
}

function chip(trend) {
  if (!trend) return "";
  const sign = trend.delta > 0 ? "+" : trend.delta < 0 ? "−" : "";
  const label =
    trend.dir === "flat"
      ? "No change"
      : `${sign}${Math.abs(trend.delta)} pts vs previous`;
  return `<span class="trend-chip ${trend.dir}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ARROW[trend.dir]}</svg>${label}</span>`;
}

function dateLabel(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Rise animation: bars render at height 0, then grow on the next frames. */
function animateIn(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("is-in")));
}

/**
 * @param {HTMLElement} el
 * @param {{score:number, timestamp:string, level?:string}[]} points oldest -> newest (max 12 used)
 * @param {{host:string}} opts
 */
export function renderTrend(el, points, { host = "" } = {}) {
  if (!el) return;
  const pts = points.slice(-12);
  if (!pts.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }

  const trend = trendOf(pts);
  const first = pts[0].score;
  const last = pts[pts.length - 1].score;
  const sub =
    pts.length > 1
      ? `${host} · last ${pts.length} scans · ${first} → ${last}`
      : `${host} · first scan`;

  const bars = pts
    .map((p, i) => {
      const lvl = levelFor(p.score);
      const isLast = i === pts.length - 1;
      return `
      <div class="trend-col${isLast ? " is-latest" : ""}">
        <div class="trend-val">${p.score}</div>
        <div class="trend-track"><div class="trend-bar ${lvl}" style="--h:${Math.max(3, p.score)}%;--i:${i}"></div></div>
        <div class="trend-date">${dateLabel(p.timestamp)}</div>
      </div>`;
    })
    .join("");

  const summary = pts.map((p) => `${p.score}`).join(", ");
  el.hidden = false;
  el.classList.remove("is-in");
  el.innerHTML = `
    <div class="trend-head">
      <div>
        <h2 class="trend-title">Score history</h2>
        <div class="trend-sub">${escapeHtml(sub)}</div>
      </div>
      ${chip(trend)}
    </div>
    <div class="trend-bars" role="img" aria-label="Scores over time, oldest to newest: ${summary}">${bars}</div>
    ${
      pts.length < 2
        ? '<p class="trend-note">Scan this site again later to see whether it is getting better or worse.</p>'
        : ""
    }`;
  animateIn(el);
}

/** Group history by host, newest scan first. */
export function groupByHost(entries) {
  const map = new Map();
  for (const e of entries) {
    const host = normalizeHost(e.url);
    if (!map.has(host)) map.set(host, []);
    map.get(host).push(e); // entries are newest first
  }
  return map;
}

export function pointsFromEntries(entriesNewestFirst) {
  return entriesNewestFirst
    .slice()
    .reverse()
    .map((e) => ({ score: e.overallScore, timestamp: e.timestamp, level: e.verdictLevel }));
}

/**
 * Dashboard of recently scanned sites on the start screen.
 */
export function createHistoryDashboard(doc, { onOpenEntry } = {}) {
  const root = doc.querySelector("[data-hist-dash]");
  const list = root?.querySelector("[data-hist-list]");
  const openAll = root?.querySelector("[data-hist-open-all]");

  openAll?.addEventListener("click", () => doc.querySelector("[data-history-open]")?.click());

  list?.addEventListener("click", (e) => {
    const row = e.target.closest("[data-entry-id]");
    if (!row) return;
    const entry = entriesById.get(row.dataset.entryId);
    if (entry) onOpenEntry?.(entry);
  });

  let entriesById = new Map();

  async function refresh() {
    if (!root || !list) return;
    let entries = [];
    try {
      entries = await listHistory();
    } catch {
      entries = [];
    }
    if (!entries.length) {
      root.hidden = true;
      list.innerHTML = "";
      return;
    }

    entriesById = new Map(entries.map((e) => [e.id, e]));
    const hosts = [...groupByHost(entries).entries()].slice(0, 4);

    list.innerHTML = hosts
      .map(([host, hostEntries]) => {
        const latest = hostEntries[0];
        const pts = pointsFromEntries(hostEntries).slice(-8);
        const trend = trendOf(pts);
        const lvl = levelFor(latest.overallScore);
        const mini = pts
          .map(
            (p, i) =>
              `<span class="mini-bar ${levelFor(p.score)}" style="--h:${Math.max(6, p.score)}%;--i:${i}"></span>`
          )
          .join("");
        return `
        <button type="button" class="hist-row" data-entry-id="${escapeHtml(latest.id)}" aria-label="Open latest scan of ${escapeHtml(host)}, score ${latest.overallScore}">
          <span class="hist-host">
            <span class="hist-name">${escapeHtml(host)}</span>
            <span class="hist-meta">${hostEntries.length} scan${hostEntries.length === 1 ? "" : "s"} · ${LEVEL_LABEL[lvl]}</span>
          </span>
          <span class="mini-bars" aria-hidden="true">${mini}</span>
          <span class="hist-score ${lvl}">${latest.overallScore}</span>
          ${chip(trend) || '<span class="trend-chip flat">First scan</span>'}
        </button>`;
      })
      .join("");

    root.hidden = false;
    root.classList.remove("is-in");
    animateIn(root);
  }

  return { refresh };
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
