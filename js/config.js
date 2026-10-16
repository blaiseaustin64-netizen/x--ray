/**
 * X-Ray front-end settings. This is the ONE place to connect your accounts backend.
 *
 * historyBackend
 *   "local"  - history stays in this browser only (default, no account needed)
 *   "remote" - also sync scans to /api/history for signed-in users
 *
 * getAuthToken()
 *   Return the signed-in user's session token (JWT or opaque), or null when
 *   signed out. The token is sent as "Authorization: Bearer <token>" to
 *   /api/scan (so limits become per-user) and to /api/history.
 *   The server verifies it through AUTH_VERIFY_URL (see functions/lib/identity.js).
 *
 *   Example once you have a login system:
 *     getAuthToken: () => localStorage.getItem("vexdyn_session"),
 */
export const CONFIG = {
  historyBackend: "local",
  apiBase: "", // "" = same origin
  getAuthToken: () => null,
};
