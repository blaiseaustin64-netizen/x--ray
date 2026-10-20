/**
 * Lightweight auth panel (sign in / sign up / verify) for X-Ray.
 * Vanilla DOM — matches existing panel patterns (history panel).
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
  const titleEl = doc.querySelector("[data-auth-title]");
  const msgEl = doc.querySelector("[data-auth-msg]");
  const formSignIn = doc.querySelector("[data-auth-form=signin]");
  const formSignUp = doc.querySelector("[data-auth-form=signup]");
  const formVerify = doc.querySelector("[data-auth-form=verify]");
  const switchEls = doc.querySelectorAll("[data-auth-switch]");

  let mode = "signin"; // signin | signup | verify
  let pendingEmail = "";
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

  function showMode(next) {
    mode = next;
    formSignIn && (formSignIn.hidden = next !== "signin");
    formSignUp && (formSignUp.hidden = next !== "signup");
    formVerify && (formVerify.hidden = next !== "verify");
    if (titleEl) {
      titleEl.textContent =
        next === "signin" ? "Sign in" : next === "signup" ? "Create account" : "Verify email";
    }
    setMsg("");
  }

  function open(startMode = "signin") {
    showMode(startMode);
    if (panel) {
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
    }
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.setAttribute("aria-hidden", "false");
    }
    doc.body.classList.add("auth-open");
    const first = panel?.querySelector("input:not([type=hidden])");
    first?.focus();
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

  function setBusy(form, on) {
    busy = on;
    form?.querySelectorAll("button[type=submit], button[data-auth-action]").forEach((b) => {
      b.disabled = on;
    });
  }

  formSignIn?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const email = formSignIn.querySelector("[name=email]")?.value?.trim() || "";
    const password = formSignIn.querySelector("[name=password]")?.value || "";
    if (!email || !password) {
      setMsg("Enter your email and password.", "err");
      return;
    }
    setBusy(formSignIn, true);
    setMsg("");
    try {
      const result = await auth.login(email, password);
      if (result.ok) {
        onAuthChange?.(result.data.user);
        close();
      } else {
        setMsg(result.data?.error || "Invalid email or password.", "err");
      }
    } finally {
      setBusy(formSignIn, false);
    }
  });

  formSignUp?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const email = formSignUp.querySelector("[name=email]")?.value?.trim() || "";
    const password = formSignUp.querySelector("[name=password]")?.value || "";
    const displayName = formSignUp.querySelector("[name=displayName]")?.value?.trim() || "";
    if (!email || !password) {
      setMsg("Enter email and password.", "err");
      return;
    }
    setBusy(formSignUp, true);
    setMsg("");
    try {
      const result = await auth.register(email, password, displayName || undefined);
      if (result.ok) {
        pendingEmail = email;
        const ve = formVerify?.querySelector("[name=email]");
        if (ve) ve.value = email;
        showMode("verify");
        setMsg(
          result.data?.message ||
            "If an account exists for that email, a verification message has been sent.",
          "ok"
        );
      } else {
        setMsg(result.data?.error || "Registration failed.", "err");
      }
    } finally {
      setBusy(formSignUp, false);
    }
  });

  formVerify?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const email =
      formVerify.querySelector("[name=email]")?.value?.trim() || pendingEmail || "";
    const code = (formVerify.querySelector("[name=code]")?.value || "").replace(/\D/g, "").slice(0, 6);
    if (!/^\d{6}$/.test(code)) {
      setMsg("Enter the 6-digit code from your email.", "err");
      return;
    }
    setBusy(formVerify, true);
    setMsg("");
    try {
      const result = await auth.verifyEmail(email, code);
      if (result.ok) {
        onAuthChange?.(result.data.user);
        close();
      } else {
        setMsg(result.data?.error || "That code is wrong or has expired.", "err");
      }
    } finally {
      setBusy(formVerify, false);
    }
  });

  formVerify?.querySelector("[data-auth-resend]")?.addEventListener("click", async () => {
    if (busy) return;
    const email =
      formVerify.querySelector("[name=email]")?.value?.trim() || pendingEmail || "";
    if (!email) return;
    setBusy(formVerify, true);
    try {
      const result = await auth.resendVerification(email);
      setMsg(result.data?.message || result.data?.error || "Request sent.", result.ok ? "ok" : "err");
    } finally {
      setBusy(formVerify, false);
    }
  });

  switchEls.forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const to = el.getAttribute("data-auth-switch");
      if (to === "signin" || to === "signup" || to === "verify") showMode(to);
    });
  });

  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel && !panel.hidden) close();
  });

  return { open, close, showMode };
}
