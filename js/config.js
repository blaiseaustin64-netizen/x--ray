/**
 * X-Ray front-end settings. Auth is wired to the shared VEXDYN backend.
 *
 * historyBackend
 *   "local"  - history stays in this browser only
 *   "remote" - also sync scans to /api/history when a session token is present
 *
 * getAuthToken()
 *   Returns the opaque VEXDYN session token (or null). Sent as
 *   Authorization: Bearer <token> to /api/scan and /api/history.
 *   Pages Functions verify it via AUTH_VERIFY_URL → GET /auth/me on the shared backend.
 */

import { getSessionToken } from "./auth.js";

export const CONFIG = {
  // Sync history when signed in; local IndexedDB still always works offline.
  historyBackend: "remote",
  apiBase: "", // same origin (Cloudflare Pages Functions)
  getAuthToken: () => getSessionToken(),
};
