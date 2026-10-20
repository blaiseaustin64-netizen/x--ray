/**
 * VEXDYN Core session helpers for X-Ray.
 * Matches the shared backend and Forge Phase 1 contracts.
 *
 * Transport: Authorization: Bearer <opaque token>
 * Storage keys match the main site / Forge: vexdyn_session, vexdyn_user
 * Cross-origin SSO uses handoff codes (not shared cookies across *.pages.dev).
 */

export const AUTH_API =
  typeof window !== "undefined" && window.__VEXDYN_AUTH_API__
    ? String(window.__VEXDYN_AUTH_API__).replace(/\/$/, "")
    : "https://vexdyn-backend.blaisepatrick556.workers.dev";

const TOKEN_KEY = "vexdyn_session";
const USER_KEY = "vexdyn_user";
const EXPIRES_KEY = "vexdyn_session_expires";

export function getSessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(token, user, expiresAt, persist = true) {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) {
      (persist ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    }
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
    if (expiresAt) localStorage.setItem(EXPIRES_KEY, expiresAt);
    else localStorage.removeItem(EXPIRES_KEY);
  } catch {
    /* private mode / quota */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  } catch {
    /* ignore */
  }
}

async function api(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  const t = token !== undefined ? token : getSessionToken();
  if (t) {
    headers.Authorization = `Bearer ${t}`;
    headers["X-Session-Token"] = t;
  }
  let res;
  try {
    res = await fetch(`${AUTH_API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "omit",
    });
  } catch {
    return { ok: false, status: 0, data: { ok: false, error: "Could not reach the authentication server." } };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, error: "Unexpected response from the authentication server." };
  }
  if (!res.ok || data?.ok === false) {
    return {
      ok: false,
      status: res.status,
      data: {
        ok: false,
        error: data?.error || "Request failed.",
        code: data?.code,
      },
    };
  }
  return { ok: true, status: res.status, data };
}

/** POST /auth/login */
export async function login(email, password) {
  const result = await api("/auth/login", {
    method: "POST",
    body: { email, password },
    token: null,
  });
  if (result.ok && result.data.sessionToken) {
    setSession(result.data.sessionToken, result.data.user, result.data.expiresAt, true);
  }
  return result;
}

/** POST /auth/register */
export async function register(email, password, displayName) {
  return api("/auth/register", {
    method: "POST",
    body: {
      email,
      password,
      ...(displayName ? { displayName } : {}),
    },
    token: null,
  });
}

/** POST /auth/verify-email */
export async function verifyEmail(email, code) {
  const result = await api("/auth/verify-email", {
    method: "POST",
    body: { email, code },
    token: null,
  });
  if (result.ok && result.data.sessionToken) {
    setSession(result.data.sessionToken, result.data.user, result.data.expiresAt, true);
  }
  return result;
}

/** POST /auth/resend-verification */
export async function resendVerification(email) {
  return api("/auth/resend-verification", {
    method: "POST",
    body: { email },
    token: null,
  });
}

/** POST /auth/logout */
export async function logout() {
  const token = getSessionToken();
  try {
    if (token) await api("/auth/logout", { method: "POST", token });
  } catch {
    /* still clear locally */
  }
  clearSession();
}

/** GET /auth/me */
export async function me() {
  const token = getSessionToken();
  if (!token) return { ok: false, status: 401, data: { ok: false, error: "Not authenticated.", code: "unauthenticated" } };
  const result = await api("/auth/me", { token });
  if (!result.ok && (result.status === 401 || result.data?.code === "unauthenticated")) {
    clearSession();
  } else if (result.ok && result.data.user) {
    setSession(token, result.data.user, result.data.session?.expiresAt || undefined, true);
  }
  return result;
}

/** POST /auth/handoff/exchange */
export async function exchangeHandoff(code, targetProduct = "xray") {
  const result = await api("/auth/handoff/exchange", {
    method: "POST",
    body: { code, targetProduct },
    token: null,
  });
  if (result.ok && result.data.sessionToken) {
    setSession(result.data.sessionToken, result.data.user, result.data.expiresAt, true);
  }
  return result;
}

/**
 * Bootstrap session: handoff query param, then /auth/me if a token exists.
 * Returns { user | null, fromHandoff?: boolean, error?: string }
 */
export async function bootstrapAuth() {
  try {
    const params = new URLSearchParams(window.location.search);
    const handoff = params.get("handoff") || params.get("code") || params.get("handoffCode");
    if (handoff) {
      const result = await exchangeHandoff(handoff, "xray");
      const url = new URL(window.location.href);
      url.searchParams.delete("handoff");
      url.searchParams.delete("code");
      url.searchParams.delete("handoffCode");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      if (result.ok) return { user: result.data.user, fromHandoff: true };
      return { user: null, error: result.data?.error || "Invalid or expired handoff code." };
    }
  } catch {
    /* ignore */
  }

  const token = getSessionToken();
  if (!token) return { user: null };

  const result = await me();
  if (result.ok && result.data.user) return { user: result.data.user };
  return { user: null };
}
