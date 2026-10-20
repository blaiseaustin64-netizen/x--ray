/**
 * Sign-in panel for X-Ray — continue with existing VEXDYN account.
 * Account creation and password reset stay on the main site.
 */

import * as auth from "../auth.js";

/**
 * @param {Document} doc
 * @param {{ onAuthChange: (user: object|null) => void }} opts
 */
export function createAuthPanel(doc, { onAuthChange } = {}) {
  const backdrop = doc.querySelector("[data-auth-backdrop]");
  const panel = doc.querySelector("[data-auth-panel]");
  const closeBtn = doc.querySelector("[data-auth-close]");
  const msgEl = doc.querySelector("[data-auth-msg]");
  const formSignIn = doc.querySelector("[data-auth-form=signin]");

  let busy = false;

  function setMsg(text, type) {
    if (!msgEl) return;
    if (!text) {
      msgEl.hidden = true;
      msgEl.textContent = "";
      msgEl.className = "auth-msg";
      return;
    }
    msgEl.hidden = false;
    msgEl.textContent = text;
    msgEl.className = `auth-msg auth-msg-${type || "info"}`;
  }

  function open() {
    setMsg("");
    if (panel) {
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
    }
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.setAttribute("aria-hidden", "false");
    }
    doc.body.classList.add("auth-open");
    formSignIn?.querySelector("input[name=email]")?.focus();
  }

  function close() {
    if (panel) {
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
    }
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.setAttribute("aria-hidden", "true");
    }
    doc.body.classList.remove("auth-open");
    setMsg("");
    busy = false;
  }

  formSignIn?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const email = formSignIn.querySelector("[name=email]")?.value?.trim() || "";
    const password = formSignIn.querySelector("[name=password]")?.value || "";
    if (!email || !password) {
      setMsg("Enter your VEXDYN email and password.", "err");
      return;
    }
    busy = true;
    const btn = formSignIn.querySelector("[type=submit]");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Signing in…";
    }
    setMsg("");
    try {
      const result = await auth.login(email, password);
      if (result.ok) {
        onAuthChange?.(result.data.user);
        close();
      } else {
        const msg =
          result.status === 0
            ? result.data?.error || "Could not reach the authentication server."
            : result.data?.error || "Invalid email or password.";
        setMsg(msg, "err");
      }
    } finally {
      busy = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Continue";
      }
    }
  });

  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel && !panel.hidden) close();
  });

  return {
    open: () => open(),
    close,
    showMode: () => open(),
  };
}
