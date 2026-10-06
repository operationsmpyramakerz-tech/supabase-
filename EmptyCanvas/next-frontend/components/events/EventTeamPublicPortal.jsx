"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EventIcon from "./EventIcon";

const ROLE_CONFIG = Object.freeze({
  instructor: { label: "Instructor", plural: "Instructors", icon: "user" },
  usher: { label: "Usher", plural: "Ushers", icon: "award" },
  organizer: { label: "Organizer", plural: "Organizers", icon: "clipboard" },
});

const EMPTY_SIGNUP = Object.freeze({
  name: "",
  nationalId: "",
  phone: "",
  email: "",
  governorate: "",
  instapay: "",
  wallet: "",
  station: "",
  idPhotoUrl: "",
  password: "",
  confirmPassword: "",
});

function text(value) {
  return String(value ?? "").trim();
}

function normalizeId(value) {
  return String(value ?? "").replace(/\D+/g, "").slice(0, 30);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(text(payload?.error || payload?.message) || `Request failed with status ${response.status}.`);
    error.code = text(payload?.code);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function ProfileRow({ label, value }) {
  return (
    <div className="event-team-public-profile__row">
      <span>{label}</span>
      <strong>{text(value) || "—"}</strong>
    </div>
  );
}

export default function EventTeamPublicPortal({ role }) {
  const roleConfig = ROLE_CONFIG[role] || ROLE_CONFIG.instructor;
  const [mode, setMode] = useState("signup");
  const [status, setStatus] = useState("checking");
  const [signup, setSignup] = useState({ ...EMPTY_SIGNUP });
  const [login, setLogin] = useState({ nationalId: "", password: "" });
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const idPhotoRef = useRef(null);

  const signupReady = useMemo(() => (
    text(signup.name)
    && normalizeId(signup.nationalId).length >= 6
    && signup.password.length >= 6
    && signup.password === signup.confirmPassword
    && !uploading
  ), [signup, uploading]);

  useEffect(() => {
    let cancelled = false;
    requestJson("/next/api/events/team/public")
      .then((payload) => {
        if (cancelled) return;
        if (payload?.profile) {
          setProfile(payload.profile);
          setStatus("profile");
        } else {
          setStatus("auth");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("auth");
      });
    return () => { cancelled = true; };
  }, []);

  function switchMode(nextMode) {
    setMode(nextMode);
    setMessage(null);
    if (nextMode === "login" && signup.nationalId && !login.nationalId) {
      setLogin((current) => ({ ...current, nationalId: normalizeId(signup.nationalId) }));
    }
  }

  async function uploadIdPhoto(file) {
    if (!file) return;
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      setMessage({ type: "error", text: "Choose an image for the ID photo." });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const { compressImage } = await import("./EventComponentAssetProcessing");
      const prepared = await compressImage(file);
      const payload = await requestJson("/next/api/events/team/public", {
        method: "POST",
        body: JSON.stringify({ action: "upload-id", dataUrl: prepared.dataUrl, fileName: prepared.fileName || file.name }),
      });
      setSignup((current) => ({ ...current, idPhotoUrl: text(payload?.url) }));
      setMessage({ type: "success", text: "ID photo uploaded." });
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Could not upload the ID photo." });
    } finally {
      setUploading(false);
    }
  }

  async function submitSignup(event) {
    event.preventDefault();
    if (busy || !signupReady) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = await requestJson("/next/api/events/team/public", {
        method: "POST",
        body: JSON.stringify({
          action: "signup",
          payload: {
            role,
            ...signup,
            nationalId: normalizeId(signup.nationalId),
            phone: text(signup.phone).replace(/\s+/g, ""),
            instapay: text(signup.instapay).replace(/\s+/g, ""),
            wallet: text(signup.wallet).replace(/\s+/g, ""),
          },
        }),
      });
      setProfile(payload?.profile || null);
      setStatus("profile");
    } catch (error) {
      if (error?.code === "ALREADY_REGISTERED" || error?.status === 409) {
        const nationalId = normalizeId(signup.nationalId);
        setLogin((current) => ({ ...current, nationalId }));
        setMode("login");
        setMessage({ type: "info", text: "This ID number is already registered. Sign in to open your data." });
      } else {
        setMessage({ type: "error", text: error?.message || "Could not complete registration." });
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    if (busy) return;
    const nationalId = normalizeId(login.nationalId);
    if (!nationalId || !login.password) {
      setMessage({ type: "error", text: "Enter your ID number and password." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const payload = await requestJson("/next/api/events/team/public", {
        method: "POST",
        body: JSON.stringify({ action: "login", payload: { nationalId, password: login.password } }),
      });
      setProfile(payload?.profile || null);
      setStatus("profile");
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Could not sign in." });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await requestJson("/next/api/events/team/public", {
        method: "POST",
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {}
    setProfile(null);
    setLogin({ nationalId: "", password: "" });
    setMode("login");
    setStatus("auth");
    setMessage(null);
    setBusy(false);
  }

  return (
    <main className="event-team-public-page">
      <link rel="stylesheet" href="/next/css/event-team-public.css?v=public-team-portal-v1" />
      <div className="event-team-public-orb event-team-public-orb--one" aria-hidden="true" />
      <div className="event-team-public-orb event-team-public-orb--two" aria-hidden="true" />

      <section className="event-team-public-shell">
        <header className="event-team-public-brand">
          <div className="event-team-public-brand__mark">P</div>
          <div>
            <strong>Pyramakerz Events</strong>
            <span>Event Team Registration</span>
          </div>
        </header>

        <div className="event-team-public-role">
          <span><EventIcon name={roleConfig.icon} /></span>
          <div>
            <small>Registration link</small>
            <strong>{roleConfig.plural}</strong>
          </div>
        </div>

        {status === "checking" ? (
          <section className="event-team-public-card event-team-public-loading" aria-live="polite">
            <span className="event-team-public-spinner" />
            <strong>Opening your registration portal...</strong>
          </section>
        ) : status === "profile" && profile ? (
          <section className="event-team-public-card event-team-public-profile">
            <div className="event-team-public-card__head">
              <div>
                <small>Your Event Team profile</small>
                <h1>{profile.name || "Registration details"}</h1>
              </div>
              <span className="event-team-public-success"><EventIcon name="check-circle" /></span>
            </div>

            <div className="event-team-public-profile__badge">
              <EventIcon name={ROLE_CONFIG[profile.role]?.icon || roleConfig.icon} />
              <span>{ROLE_CONFIG[profile.role]?.label || roleConfig.label}</span>
              <b>{profile.isActive === false ? "Inactive" : "Registered"}</b>
            </div>

            <div className="event-team-public-profile__grid">
              <ProfileRow label="ID number" value={profile.nationalId} />
              <ProfileRow label="Phone" value={profile.phone} />
              <ProfileRow label="Email" value={profile.email} />
              <ProfileRow label="Governorate" value={profile.governorate} />
              <ProfileRow label="InstaPay" value={profile.instapay} />
              <ProfileRow label="Wallet" value={profile.wallet} />
              {profile.role === "instructor" ? <ProfileRow label="Station" value={profile.station} /> : null}
            </div>

            {profile.idPhotoUrl ? (
              <a className="event-team-public-id-preview" href={profile.idPhotoUrl} target="_blank" rel="noreferrer">
                <img src={profile.idPhotoUrl} alt="Uploaded ID" />
                <span>View uploaded ID</span>
                <EventIcon name="external-link" />
              </a>
            ) : null}

            <button type="button" className="event-team-public-secondary event-team-public-logout" onClick={logout} disabled={busy}>
              {busy ? "Signing out..." : "Sign out"}
            </button>
          </section>
        ) : (
          <section className="event-team-public-card">
            <div className="event-team-public-card__head">
              <div>
                <small>Welcome</small>
                <h1>{mode === "signup" ? `Join as ${roleConfig.label}` : "Sign in to your profile"}</h1>
              </div>
            </div>

            <div className="event-team-public-switch" role="tablist" aria-label="Registration mode">
              <button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => switchMode("signup")}>Sign up</button>
              <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => switchMode("login")}>Sign in</button>
            </div>

            {message ? <div className={`event-team-public-message is-${message.type || "info"}`}>{message.text}</div> : null}

            {mode === "signup" ? (
              <form className="event-team-public-form" onSubmit={submitSignup}>
                <label className="event-team-public-field event-team-public-field--wide">
                  <span>Full name *</span>
                  <input value={signup.name} onChange={(event) => setSignup((current) => ({ ...current, name: event.target.value }))} autoComplete="name" placeholder="Your full name" />
                </label>
                <label className="event-team-public-field">
                  <span>ID number *</span>
                  <input inputMode="numeric" value={signup.nationalId} onChange={(event) => setSignup((current) => ({ ...current, nationalId: normalizeId(event.target.value) }))} autoComplete="off" placeholder="Enter your ID number" />
                </label>
                <label className="event-team-public-field">
                  <span>Phone</span>
                  <input inputMode="tel" value={signup.phone} onChange={(event) => setSignup((current) => ({ ...current, phone: event.target.value }))} autoComplete="tel" placeholder="01xxxxxxxxx" />
                </label>
                <label className="event-team-public-field">
                  <span>Email</span>
                  <input type="email" value={signup.email} onChange={(event) => setSignup((current) => ({ ...current, email: event.target.value }))} autoComplete="email" placeholder="name@example.com" />
                </label>
                <label className="event-team-public-field">
                  <span>Governorate</span>
                  <input value={signup.governorate} onChange={(event) => setSignup((current) => ({ ...current, governorate: event.target.value }))} placeholder="Cairo" />
                </label>
                <label className="event-team-public-field">
                  <span>InstaPay</span>
                  <input inputMode="tel" value={signup.instapay} onChange={(event) => setSignup((current) => ({ ...current, instapay: event.target.value }))} placeholder="InstaPay number" />
                </label>
                <label className="event-team-public-field">
                  <span>Wallet</span>
                  <input inputMode="tel" value={signup.wallet} onChange={(event) => setSignup((current) => ({ ...current, wallet: event.target.value }))} placeholder="Wallet number" />
                </label>
                {role === "instructor" ? (
                  <label className="event-team-public-field event-team-public-field--wide">
                    <span>Station / Robotics experience</span>
                    <input value={signup.station} onChange={(event) => setSignup((current) => ({ ...current, station: event.target.value }))} placeholder="e.g. 3D Printer, Robotics, Arduino" />
                  </label>
                ) : null}

                <div className="event-team-public-field event-team-public-field--wide">
                  <span>ID photo</span>
                  <input ref={idPhotoRef} className="event-team-public-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) uploadIdPhoto(file); }} />
                  <button type="button" className="event-team-public-upload" onClick={() => idPhotoRef.current?.click()} disabled={uploading || busy}>
                    <EventIcon name="image" />
                    <span>{uploading ? "Uploading..." : signup.idPhotoUrl ? "Replace ID photo" : "Upload ID photo"}</span>
                    {signup.idPhotoUrl ? <b>Uploaded</b> : null}
                  </button>
                </div>

                <label className="event-team-public-field">
                  <span>Password *</span>
                  <input type="password" value={signup.password} onChange={(event) => setSignup((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" placeholder="At least 6 characters" />
                </label>
                <label className="event-team-public-field">
                  <span>Confirm password *</span>
                  <input type="password" value={signup.confirmPassword} onChange={(event) => setSignup((current) => ({ ...current, confirmPassword: event.target.value }))} autoComplete="new-password" placeholder="Repeat password" />
                  {signup.confirmPassword && signup.password !== signup.confirmPassword ? <small className="event-team-public-field-error">Passwords do not match.</small> : null}
                </label>

                <button type="submit" className="event-team-public-primary event-team-public-field--wide" disabled={!signupReady || busy}>
                  {busy ? "Creating your profile..." : "Create profile"}
                </button>
                <p className="event-team-public-footnote event-team-public-field--wide">Already registered? <button type="button" onClick={() => switchMode("login")}>Sign in instead</button></p>
              </form>
            ) : (
              <form className="event-team-public-form event-team-public-form--login" onSubmit={submitLogin}>
                <label className="event-team-public-field event-team-public-field--wide">
                  <span>ID number</span>
                  <input inputMode="numeric" value={login.nationalId} onChange={(event) => setLogin((current) => ({ ...current, nationalId: normalizeId(event.target.value) }))} autoComplete="username" placeholder="Enter your ID number" autoFocus />
                </label>
                <label className="event-team-public-field event-team-public-field--wide">
                  <span>Password</span>
                  <input type="password" value={login.password} onChange={(event) => setLogin((current) => ({ ...current, password: event.target.value }))} autoComplete="current-password" placeholder="Your password" />
                </label>
                <button type="submit" className="event-team-public-primary event-team-public-field--wide" disabled={busy || !normalizeId(login.nationalId) || !login.password}>
                  {busy ? "Signing in..." : "Sign in"}
                </button>
                <p className="event-team-public-footnote event-team-public-field--wide">New here? <button type="button" onClick={() => switchMode("signup")}>Create a profile</button></p>
              </form>
            )}
          </section>
        )}

        <footer className="event-team-public-footer">Pyramakerz · Event Team Portal</footer>
      </section>
    </main>
  );
}
