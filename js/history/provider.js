/**
 * History data layer used by the charts and dashboard.
 *
 * Local history (IndexedDB / localStorage, js/history/storage.js) always works.
 * When CONFIG.historyBackend is "remote" and the user has a token, scans are
 * also synced to /api/history and merged into what the UI shows.
 */

import { CONFIG } from "../config.js";
import { listScans } from "./storage.js";

function remoteEnabled() {
  return CONFIG.historyBackend === "remote" && !!CONFIG.getAuthToken?.();
}

function authHeaders() {
  const token = CONFIG.getAuthToken?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function normalizeHost(u) {
  return String(u || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0];
}

/** Newest first. Merges local + remote (remote wins on near-identical timestamps). */
export async function listHistory() {
  const local = await listScans();
  if (!remoteEnabled()) return local;

  try {
    const res = await fetch(`${CONFIG.apiBase}/api/history?limit=200`, {
      headers: authHeaders(),
    });
    if (!res.ok) return local;
    const { entries = [] } = await res.json();
    const remote = entries.filter((e) => e && e.report && typeof e.overallScore === "number");

    const seen = new Set(remote.map((e) => `${normalizeHost(e.url)}|${Math.round(new Date(e.timestamp) / 60000)}`));
    const localOnly = local.filter(
      (e) => !seen.has(`${normalizeHost(e.url)}|${Math.round(new Date(e.timestamp) / 60000)}`)
    );
    return [...remote, ...localOnly].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch {
    return local;
  }
}

/** Fire-and-forget upload of a finished scan. Never throws, never blocks the UI. */
export function recordRemote(report) {
  if (!remoteEnabled() || !report) return;
  fetch(`${CONFIG.apiBase}/api/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ report }),
  }).catch(() => {});
}
