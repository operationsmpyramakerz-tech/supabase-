"use client";

import { useMemo, useState } from "react";

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
  if (type === "lock") return <span aria-hidden="true">⌁</span>;
  if (type === "mail") return <span aria-hidden="true">@</span>;
  if (type === "phone") return <span aria-hidden="true">☎</span>;
  if (type === "code") return <span aria-hidden="true">#</span>;
  return <span aria-hidden="true">◎</span>;
}

export default function LoginClient({ requestedNext = "/next/home", backendAvailable = true, classicLoginHref = "/login?classic=1" }) {
  const [mode, setMode] = useState(MODES.LOGIN);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [notice, setNotice] = useState(null);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const destination = useMemo(() => safeDestination(requestedNext), [requestedNext]);

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
      setLoginSuccess(true);
      try {
        const accountResponse = await fetch(`/api/account?_next_login_check=${Date.now()}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (accountResponse.ok) warmAccountCache(await readJson(accountResponse), username);
      } catch {}

      window.setTimeout(() => window.location.replace(destination), 620);
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
    <main className={`next-login-page ${loginSuccess ? "is-success" : ""}`}>
      <section className="next-login-shell">
        <aside className="next-login-brand-panel">
          <div className="next-login-brand-visual">
            <span className="next-login-orbit orbit-one" aria-hidden="true" />
            <span className="next-login-orbit orbit-two" aria-hidden="true" />
            <div className="next-login-brand-mark">
              <img src="/images/logo.png" alt="Pyramakerz" />
            </div>
          </div>
          <div className="next-login-brand-copy">
            <span className="next-login-kicker">Operations Hub</span>
            <h1>One secure workspace for your daily operations.</h1>
            <p>Orders, inventory, events, tasks, finance, LMS, KPIs, and customer workflows — all from the same account.</p>
          </div>
          <div className="next-login-capabilities" aria-label="Operations Hub capabilities">
            <span>ERP</span><span>LMS</span><span>Workflows</span><span>Analytics</span>
          </div>
        </aside>

        <section className="next-login-card" aria-live="polite">
          <div className="next-login-mobile-brand">
            <img src="/images/logo.png" alt="" />
            <div><strong>Pyramakerz</strong><small>Operations Hub</small></div>
          </div>

          <div className="next-login-card-heading">
            <span>{mode === MODES.LOGIN ? "Welcome back" : mode === MODES.RECOVERY ? "Account recovery" : "New account request"}</span>
            <h2>{mode === MODES.LOGIN ? "Sign in" : mode === MODES.RECOVERY ? "Recover your password" : "Request access"}</h2>
            <p>
              {mode === MODES.LOGIN
                ? "Use the same Operations Hub credentials you already use."
                : mode === MODES.RECOVERY
                  ? "Enter the email saved on your employee account."
                  : "Send your details to the admin team for approval."}
            </p>
          </div>

          {!backendAvailable ? (
            <div className="next-login-notice warning">The ERP service did not answer the initial session check. You can still try to sign in.</div>
          ) : null}
          {notice ? <div className={`next-login-notice ${notice.kind}`}>{notice.text}</div> : null}

          {mode === MODES.LOGIN ? (
            <form className="next-login-form" onSubmit={handleLogin}>
              <label>
                <span>Username</span>
                <div className="next-login-field"><FieldIcon type="user" /><input name="username" autoComplete="username" required placeholder="Enter your username" /></div>
              </label>
              <label>
                <span>Password</span>
                <div className="next-login-field"><FieldIcon type="lock" /><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Enter your password" /><button className="next-login-show-password" type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button></div>
              </label>
              <div className="next-login-form-links"><button type="button" onClick={() => switchMode(MODES.RECOVERY)}>Forgot password?</button></div>
              <button className="next-login-submit" type="submit" disabled={busy || loginSuccess}>{loginSuccess ? "Opening Operations Hub…" : busy ? "Signing in…" : "Sign in"}</button>
              <button className="next-login-secondary-action" type="button" onClick={() => switchMode(MODES.SIGNUP)} disabled={busy}>Don&apos;t have an account? <strong>Sign up</strong></button>
            </form>
          ) : null}

          {mode === MODES.RECOVERY ? (
            <form className="next-login-form" onSubmit={handleRecovery}>
              <label>
                <span>Registered email</span>
                <div className="next-login-field"><FieldIcon type="mail" /><input name="email" type="email" autoComplete="email" required placeholder="name@company.com" /></div>
              </label>
              <button className="next-login-submit" type="submit" disabled={busy}>{busy ? "Sending…" : "Send password"}</button>
              <button className="next-login-secondary-action" type="button" onClick={() => switchMode(MODES.LOGIN)} disabled={busy}>Back to sign in</button>
            </form>
          ) : null}

          {mode === MODES.SIGNUP ? (
            <form className="next-login-form next-login-signup-form" onSubmit={handleSignup}>
              <label><span>Username</span><div className="next-login-field"><FieldIcon type="user" /><input name="username" autoComplete="username" required placeholder="Your name / username" /></div></label>
              <div className="next-login-form-grid">
                <label><span>Password</span><div className="next-login-field"><FieldIcon type="lock" /><input name="password" type={showSignupPassword ? "text" : "password"} autoComplete="new-password" minLength={4} required placeholder="Minimum 4 characters" /></div></label>
                <label><span>Repeat password</span><div className="next-login-field"><FieldIcon type="lock" /><input name="repeatPassword" type={showSignupPassword ? "text" : "password"} autoComplete="new-password" minLength={4} required placeholder="Repeat password" /></div></label>
              </div>
              <button className="next-login-password-toggle" type="button" onClick={() => setShowSignupPassword((value) => !value)}>{showSignupPassword ? "Hide passwords" : "Show passwords"}</button>
              <label><span>Employee code</span><div className="next-login-field"><FieldIcon type="code" /><input name="employeeCode" required placeholder="Employee code" /></div></label>
              <div className="next-login-form-grid">
                <label><span>Phone</span><div className="next-login-field"><FieldIcon type="phone" /><input name="phone" type="tel" autoComplete="tel" required placeholder="Phone number" /></div></label>
                <label><span>Email</span><div className="next-login-field"><FieldIcon type="mail" /><input name="email" type="email" autoComplete="email" required placeholder="Email address" /></div></label>
              </div>
              <button className="next-login-submit" type="submit" disabled={busy}>{busy ? "Sending request…" : "Send sign up request"}</button>
              <button className="next-login-secondary-action" type="button" onClick={() => switchMode(MODES.LOGIN)} disabled={busy}>Back to sign in</button>
            </form>
          ) : null}

          <div className="next-login-footer">
            <span>Secure session authentication</span>
            <a href={classicLoginHref}>Use classic sign in</a>
          </div>
        </section>
      </section>
    </main>
  );
}
