"use client";

import { useEffect, useMemo, useState } from "react";

const MODES = Object.freeze({ LOGIN: "login", RECOVERY: "recovery", SIGNUP: "signup" });

function safeMessage(message, fallback) {
  const value = String(message || "").trim();
  if (!value) return fallback;
  const internal = /(notion|supabase|database\s*id|database\s*ids|team_members|vercel|environment\s+variables?|service_role|api\s*key|schema|migration|rpc|rest|sql|table\s+is\s+not\s+configured)/i;
  return internal.test(value) ? fallback : value;
}

function safeDestination(value) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/next/home";
  if (/^\/login(?:[/?#]|$)/i.test(raw) || /^\/next\/login(?:[/?#]|$)/i.test(raw)) return "/next/home";
  return raw;
}

function warmAccountCache(account, fallbackUsername) {
  const data = account && typeof account === "object" ? account : {};
  const name = String(data.name || data.username || fallbackUsername || "").trim();
  const allowedPages = Array.isArray(data.allowedPages) ? data.allowedPages : [];

  try { if (name) localStorage.setItem("username", name); } catch {}
  try { sessionStorage.setItem("allowedPages", JSON.stringify(allowedPages)); } catch {}
  try {
    localStorage.setItem("ops.ui.chrome.v1", JSON.stringify({
      name,
      username: name,
      position: String(data.position || "").trim(),
      department: String(data.department || "").trim(),
      email: String(data.email || "").trim(),
      photoUrl: String(data.photoUrl || "").trim(),
      allowedPages,
      savedAt: Date.now(),
    }));
  } catch {}
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function FieldIcon({ type }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (type === "lock") return <svg {...common}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
  if (type === "mail") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" ry="2"/><path d="m3 7 9 6 9-6"/></svg>;
  if (type === "phone") return <svg {...common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.89.68 2.78a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.11-.45c.89.33 1.82.55 2.78.68A2 2 0 0 1 22 16.92z"/></svg>;
  if (type === "code") return <svg {...common}><path d="M4 7h16"/><path d="M10 11h4"/><rect x="4" y="3" width="16" height="18" rx="2"/></svg>;
  return <svg {...common}><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>;
}

function EyeIcon({ off = false }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (off) return <svg className="icon-eye-off" width="20" height="20" {...common}><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.7 20.7 0 0 1 5.06-6.94"/><path d="M1 1l22 22"/><path d="M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-.88"/></svg>;
  return <svg className="icon-eye" width="20" height="20" {...common}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
}

export default function LoginClient({ requestedNext = "/next/home", backendAvailable = true, classicLoginHref = "/login?classic=1" }) {
  const [mode, setMode] = useState(MODES.LOGIN);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState(null);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const destination = useMemo(() => safeDestination(requestedNext), [requestedNext]);

  useEffect(() => {
    const body = document.body;
    body.classList.add("next-classic-login-active");
    body.classList.toggle("auth-signup-mode", mode === MODES.SIGNUP);
    body.classList.toggle("auth-recovery-mode", mode === MODES.RECOVERY);
    body.classList.toggle("login-inline-success-active", loginSuccess);
    return () => {
      body.classList.remove("next-classic-login-active", "auth-signup-mode", "auth-recovery-mode", "login-success-active", "login-inline-success-active");
    };
  }, [mode, loginSuccess]);


  function switchMode(nextMode) {
    if (busy) return;
    setNotice(null);
    setMode(nextMode);
  }

  function showError(message, fallback = "Something went wrong. Please try again.") {
    setNotice({ kind: "error", text: safeMessage(message, fallback) });
  }

  function showSuccess(message, fallback) {
    setNotice({ kind: "success", text: safeMessage(message, fallback) });
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (busy) return;
    setNotice(null);
    setBusy(true);
    let redirecting = false;

    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") || "").trim();
    const password = String(form.get("password") || "");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await readJson(response);

      if (!response.ok || !result?.success) {
        showError(response.status === 401 ? "Invalid username or password." : result?.error, "Login failed. Please try again.");
        return;
      }

      redirecting = true;
      const transitionStartedAt = Date.now();
      setLoginSuccess(true);
      try {
        const accountResponse = await fetch(`/api/account?_next_login_check=${Date.now()}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (accountResponse.ok) warmAccountCache(await readJson(accountResponse), username);
      } catch {}

      // Match the current Classic login: keep the user on the card long enough
      // for the pulse transition to finish before opening the requested page.
      const remaining = Math.max(0, 1950 - (Date.now() - transitionStartedAt));
      window.setTimeout(() => window.location.replace(destination), remaining);
    } catch (error) {
      console.error("Next login error:", error);
      showError("Network error. Please check your connection and try again.");
    } finally {
      if (!redirecting) setBusy(false);
    }
  }

  async function handleRecovery(event) {
    event.preventDefault();
    if (busy) return;
    setNotice(null);
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await readJson(response);
      if (response.ok && result?.success) {
        showSuccess(result?.message, "Password sent successfully. Please check your inbox.");
      } else {
        showError(result?.error, response.status === 404 ? "No user found with this email." : "Could not send password. Please try again.");
      }
    } catch (error) {
      console.error("Next password recovery error:", error);
      showError("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    if (busy) return;
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      username: String(form.get("username") || "").trim(),
      password: String(form.get("password") || ""),
      repeatPassword: String(form.get("repeatPassword") || ""),
      employeeCode: String(form.get("employeeCode") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      email: String(form.get("email") || "").trim(),
    };

    if (payload.password !== payload.repeatPassword) {
      showError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/signup-request", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJson(response);
      if (response.ok && result?.ok) {
        event.currentTarget.reset();
        showSuccess(result?.message, "Your sign up request was sent successfully.");
      } else {
        showError(result?.error, "Could not send sign up request.");
      }
    } catch (error) {
      console.error("Next signup error:", error);
      showError("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <link rel="stylesheet" href="/css/login.css?v=concept-2-pulse-settle-v1" />
      <div className="login-container">
        <div className="login-card" aria-live="polite">
          <div className="login-header">
            <span className="signup-logo-burst" aria-hidden="true">
              <i /><i /><i /><i /><i /><i /><i /><i />
            </span>
            <span className={`login-logo-stage ${loginSuccess ? "is-running" : ""}`} id="loginLogoStage" data-logo-animation="pulse">
              <img src="/images/logo.png" alt="Logo" className="login-logo" />
              <span className="login-inline-logo-pieces" aria-hidden="true">
                <span className="login-inline-logo-pulse-echo" style={{ "--d": "0.00s" }} />
                <span className="login-inline-logo-pulse-echo" style={{ "--d": "0.16s" }} />
                <span className="login-inline-logo-pulse-echo" style={{ "--d": "0.32s" }} />
              </span>
              <span className="login-inline-logo-ring" aria-hidden="true" />
              <span className="login-inline-logo-flare login-inline-logo-flare--one" aria-hidden="true" />
              <span className="login-inline-logo-flare login-inline-logo-flare--two" aria-hidden="true" />
            </span>
            <img src="/images/pyramakerz-wordmark.png" alt="Pyramakerz" className="login-wordmark" />
            <h1 className="login-brand-title">Pyramakerz</h1>
            <p className="login-subtitle" aria-hidden="true" />
          </div>

          {mode === MODES.LOGIN ? (
            <form className="login-form" onSubmit={handleLogin}>
              <div className="form-group">
                <div className="input-with-icon">
                  <span className="input-icon" aria-hidden="true"><FieldIcon type="user" /></span>
                  <input type="text" name="username" required placeholder="Username" autoComplete="username" />
                </div>
              </div>

              <div className="form-group">
                <div className="password-wrapper input-with-icon">
                  <span className="input-icon" aria-hidden="true"><FieldIcon type="lock" /></span>
                  <input type={showPassword ? "text" : "password"} name="password" required placeholder="Password" autoComplete="current-password" />
                  <button type="button" className="toggle-password" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
              </div>

              <button type="button" className="forgot-password-link" onClick={() => switchMode(MODES.RECOVERY)} disabled={busy}>Forgot password?</button>
              <button type="submit" className={`login-btn ${busy || loginSuccess ? "loading" : ""}`} disabled={busy || loginSuccess}>
                <span>{loginSuccess ? "Opening Operations Hub..." : busy ? "Signing In..." : "Sign In"}</span>
              </button>
              <button type="button" className="signup-inline-prompt" onClick={() => switchMode(MODES.SIGNUP)} disabled={busy}>
                <span className="signup-prompt-text">Don&apos;t have an account?</span>
                <span className="signup-prompt-action">Sign up</span>
              </button>
            </form>
          ) : null}

          {mode === MODES.RECOVERY ? (
            <form className="login-form forgot-form" onSubmit={handleRecovery}>
              <div className="forgot-copy">
                <h2>Password Recovery</h2>
                <p>Enter your registered email and we will send the saved password to your inbox.</p>
              </div>
              <div className="form-group">
                <div className="input-with-icon">
                  <span className="input-icon" aria-hidden="true"><FieldIcon type="mail" /></span>
                  <input type="email" name="email" required placeholder="Enter your email" autoComplete="email" />
                </div>
              </div>
              <button type="submit" className={`login-btn recovery-btn ${busy ? "loading" : ""}`} disabled={busy}><span>{busy ? "Sending..." : "Send Password"}</span></button>
              <button type="button" className="back-login-link" onClick={() => switchMode(MODES.LOGIN)} disabled={busy}>Back to login</button>
            </form>
          ) : null}

          {mode === MODES.SIGNUP ? (
            <form className="login-form signup-form" onSubmit={handleSignup}>
              <div className="forgot-copy signup-copy">
                <h2>Sign Up Request</h2>
                <p>Send your account details to the admin team for approval.</p>
              </div>
              <div className="form-group"><div className="input-with-icon"><span className="input-icon" aria-hidden="true"><FieldIcon type="user" /></span><input type="text" name="username" required placeholder="Username" autoComplete="username" /></div></div>
              <div className="form-group signup-password-grid"><div className="input-with-icon"><span className="input-icon" aria-hidden="true"><FieldIcon type="lock" /></span><input type="password" name="password" required minLength={4} placeholder="Password" autoComplete="new-password" /></div></div>
              <div className="form-group"><div className="input-with-icon"><span className="input-icon" aria-hidden="true"><FieldIcon type="lock" /></span><input type="password" name="repeatPassword" required minLength={4} placeholder="Repeat password" autoComplete="new-password" /></div></div>
              <div className="form-group"><div className="input-with-icon"><span className="input-icon" aria-hidden="true"><FieldIcon type="code" /></span><input type="text" name="employeeCode" required placeholder="Employee code" autoComplete="off" /></div></div>
              <div className="form-group"><div className="input-with-icon"><span className="input-icon" aria-hidden="true"><FieldIcon type="phone" /></span><input type="tel" name="phone" required placeholder="Phone" autoComplete="tel" /></div></div>
              <div className="form-group"><div className="input-with-icon"><span className="input-icon" aria-hidden="true"><FieldIcon type="mail" /></span><input type="email" name="email" required placeholder="Email" autoComplete="email" /></div></div>
              <button type="submit" className={`login-btn signup-submit-btn ${busy ? "loading" : ""}`} disabled={busy}><span>{busy ? "Sending request..." : "Send sign up request"}</span></button>
              <button type="button" className="back-login-link" onClick={() => switchMode(MODES.LOGIN)} disabled={busy}>Back to login</button>
            </form>
          ) : null}

          {!backendAvailable && !notice ? <div className="error-message">The ERP service did not answer the initial session check. You can still try to sign in.</div> : null}
          {notice ? <div className={notice.kind === "success" ? "success-message" : "error-message"}>{notice.text}</div> : null}
        </div>
      </div>
    </>
  );
}
