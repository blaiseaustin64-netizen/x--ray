/**
 * Scan history storage — IndexedDB primary, localStorage fallback.
 * Only successful scans are stored. Failures never touch this module.
 */

const DB_NAME = "vexdyn-xray-history";
const DB_VERSION = 1;
const STORE = "scans";
const LS_KEY = "vexdyn-xray-history-v1";
const SCHEMA_VERSION = 1;
const MAX_ENTRIES = 50;

/** @type {'idb'|'local'|'none'|null} */
let backend = null;
/** @type {IDBDatabase|null} */
let dbPromise = null;

/**
 * Probe storage. Returns 'idb' | 'local' | 'none'.
 */
export async function initHistoryStorage() {
  if (backend) return backend;

  try {
    if (typeof indexedDB !== "undefined") {
      await openDb();
      backend = "idb";
      return backend;
    }
  } catch {
    /* fall through */
  }

  try {
    const k = "__xray_hist_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    backend = "local";
    return backend;
  } catch {
    backend = "none";
    return backend;
  }
}

export function isHistoryAvailable() {
  return backend === "idb" || backend === "local";
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error("IDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("timestamp", "timestamp", { unique: false });
        os.createIndex("url", "url", { unique: false });
      }
    };
  });
  return dbPromise;
}

function makeId() {
  return `scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Persist a successful report. Returns the stored entry or null.
 */
export async function saveScan(report) {
  try {
    if (!isHistoryAvailable() || !report || typeof report !== "object") return null;
    if (typeof report.overallScore !== "number") return null;

    const entry = {
      id: makeId(),
      schemaVersion: SCHEMA_VERSION,
      url: String(report.url || report.finalUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
      timestamp: report.scannedAt || new Date().toISOString(),
      overallScore: report.overallScore,
      verdict: report.verdict || "",
      report: structuredCloneSafe(report),
    };

    if (!entry.url || !entry.report) return null;

    if (backend === "idb") {
      const db = await openDb();
      await idbPut(db, entry);
      await trimIdb(db);
    } else if (backend === "local") {
      const list = readLocal();
      list.unshift(entry);
      writeLocal(list.slice(0, MAX_ENTRIES));
    }

    return entry;
  } catch (err) {
    console.warn("history save failed", err);
    return null;
  }
}

/**
 * @returns {Promise<Array>} newest first
 */
export async function listScans() {
  try {
    if (!isHistoryAvailable()) return [];
    let list = [];
    if (backend === "idb") {
      const db = await openDb();
      list = await idbGetAll(db);
    } else {
      list = readLocal();
    }
    return list
      .filter(isValidEntry)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.warn("history list failed", err);
    return [];
  }
}

export async function getScan(id) {
  try {
    if (!isHistoryAvailable() || !id) return null;
    if (backend === "idb") {
      const db = await openDb();
      const entry = await idbGet(db, id);
      return isValidEntry(entry) ? entry : null;
    }
    const entry = readLocal().find((e) => e.id === id);
    return isValidEntry(entry) ? entry : null;
  } catch {
    return null;
  }
}

export async function deleteScan(id) {
  try {
    if (!isHistoryAvailable() || !id) return false;
    if (backend === "idb") {
      const db = await openDb();
      await idbDelete(db, id);
    } else {
      writeLocal(readLocal().filter((e) => e.id !== id));
    }
    return true;
  } catch {
    return false;
  }
}

export async function clearAllScans() {
  try {
    if (!isHistoryAvailable()) return false;
    if (backend === "idb") {
      const db = await openDb();
      await idbClear(db);
    } else {
      localStorage.removeItem(LS_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Scores for a hostname, newest first (for trend chart).
 */
export async function scoresForHost(hostname, limit = 6) {
  const all = await listScans();
  const host = normalizeHost(hostname);
  return all
    .filter((e) => normalizeHost(e.url) === host)
    .slice(0, limit)
    .map((e) => e.overallScore);
}

function normalizeHost(u) {
  return String(u || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function isValidEntry(e) {
  if (!e || typeof e !== "object") return false;
  if (!e.id || !e.url || !e.timestamp) return false;
  if (typeof e.overallScore !== "number") return false;
  if (!e.report || typeof e.report !== "object") return false;
  return true;
}

function structuredCloneSafe(obj) {
  try {
    if (typeof structuredClone === "function") return structuredClone(obj);
  } catch {
    /* fall through */
  }
  return JSON.parse(JSON.stringify(obj));
}

/* ---------- IndexedDB helpers ---------- */

function idbPut(db, entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbClear(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function trimIdb(db) {
  const all = await idbGetAll(db);
  if (all.length <= MAX_ENTRIES) return;
  const sorted = all.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  const drop = sorted.slice(MAX_ENTRIES);
  await Promise.all(drop.map((e) => idbDelete(db, e.id)));
}

/* ---------- localStorage helpers ---------- */

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
    return [];
  }
}

function writeLocal(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}
