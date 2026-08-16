"use client";

import { useEffect, useRef, useState } from "react";

const FIELD_META = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "department", label: "Department", type: "text" },
  { key: "position", label: "Position", type: "text" },
  { key: "phone", label: "Phone", type: "text", placeholder: "e.g. 0123456789" },
  { key: "email", label: "Email", type: "email", placeholder: "e.g. name@company.com" },
  { key: "employeeCode", label: "Employee Code", type: "number" },
  { key: "password", label: "Password", type: "password", required: true, placeholder: "New password" },
];

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function initials(name) {
  const parts = text(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] || "") : "";
  return `${first}${last}`.toUpperCase() || "U";
}

function safeUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^(https?:|data:|blob:|\/)/i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

function hostLabel(value) {
  const url = safeUrl(value);
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function normalizeFiles(files) {
  return (Array.isArray(files) ? files : [])
    .map((file, index) => ({
      name: text(file?.name) || `File ${index + 1}`,
      url: safeUrl(file?.url || file?.external?.url || file?.file?.url),
    }))
    .filter((file) => file.name || file.url);
}

function normalizeAccount(account = {}) {
  return {
    ...account,
    name: text(account?.name || account?.username),
    username: text(account?.username || account?.name),
    department: text(account?.department),
    position: text(account?.position),
    phone: text(account?.phone),
    email: text(account?.email),
    employeeCode: text(account?.employeeCode),
    photoUrl: safeUrl(account?.photoUrl),
    coverPhotoUrl: safeUrl(account?.coverPhotoUrl),
    passwordSet: account?.passwordSet === true,
    filesMedia: normalizeFiles(account?.filesMedia),
  };
}

async function readFileAsDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}

async function loadImage(dataUrl) {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be prepared."));
    image.src = dataUrl;
  });
}

async function imageDataUrl(file, kind) {
  const raw = await readFileAsDataUrl(file);
  const type = lower(file?.type);
  const fileName = lower(file?.name);
  if (type === "image/gif" || type === "image/svg+xml" || /\.(gif|svg)$/i.test(fileName)) return raw;

  try {
    const image = await loadImage(raw);
    const maxWidth = kind === "cover" ? 1920 : 1400;
    const maxHeight = kind === "cover" ? 1080 : 1400;
    const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
    const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return raw;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let compressed = canvas.toDataURL("image/webp", 0.74);
    if (!compressed.startsWith("data:image/webp")) compressed = canvas.toDataURL("image/jpeg", 0.76);
    return compressed && compressed.length < raw.length ? compressed : raw;
  } catch {
    return raw;
  }
}

async function requestJson(url, options = {}, { redirectOn401 = true } = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && redirectOn401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }
  if (!response.ok || body?.ok === false || body?.success === false) {
    const error = new Error(text(body?.error || body?.message) || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    paperclip: <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
    folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z"/></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/></>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
    monitor: <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>,
    lock: <><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    alert: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.7 20.7 0 0 1 5.06-6.94"/><path d="M1 1l22 22"/><path d="M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-.88"/></>,
  };
  return <svg {...common}>{paths[name] || paths.file}</svg>;
}

function fileIcon(file) {
  const value = `${file?.name || ""} ${file?.url || ""}`.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|svg|avif)(\?|#|$)/i.test(value)) return "image";
  if (/\.(xls|xlsx|csv)(\?|#|$)/i.test(value)) return "grid";
  if (/\.(ppt|pptx)(\?|#|$)/i.test(value)) return "monitor";
  if (/\.(zip|rar|7z)(\?|#|$)/i.test(value)) return "archive";
  return "file";
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const type = toast.type === "error" ? "error" : toast.type === "success" ? "success" : "info";
  return (
    <div className="toast-stack account-classic-toast" role="status" aria-live="polite">
      <div className={`toast toast--${type} is-in`}>
        <span className="toast__icon"><Icon name={type === "success" ? "check" : type === "error" ? "alert" : "file"} size={14} /></span>
        <div className="toast__content"><div className="toast__title">{toast.title || "My Account"}</div><div className="toast__msg">{toast.message}</div></div>
        <button className="toast__close" type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
    </div>
  );
}

function PasswordToggle({ visible, onToggle, label }) {
  return (
    <button type="button" className="toggle-password" aria-label={`${visible ? "Hide" : "Show"} ${label}`} aria-pressed={visible} onClick={onToggle}>
      <Icon name={visible ? "eyeOff" : "eye"} size={20} />
    </button>
  );
}

function EditFieldModal({ field, account, onClose, onSaved }) {
  const isPassword = field?.key === "password";
  const [value, setValue] = useState(isPassword ? "" : text(account?.[field?.key]));
  const [currentPassword, setCurrentPassword] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  async function submit(event) {
    event.preventDefault();
    const nextValue = String(value ?? "").trim();
    if (field?.required && !nextValue) return setError(`${field.label} cannot be empty.`);
    if (!text(currentPassword)) return setError("Current password is required.");
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/account/verify-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword }),
      }, { redirectOn401: false });

      await requestJson("/api/account", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, [field.key]: nextValue || null }),
      }, { redirectOn401: false });

      const refreshed = await requestJson("/api/account", {}, { redirectOn401: true });
      onSaved(normalizeAccount(refreshed), `${field.label} updated successfully.`);
      onClose();
    } catch (saveError) {
      setError(saveError?.status === 401 ? "invalid password" : (saveError?.message || "The account field could not be updated."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ex-modal" style={{ display: "flex" }} aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="ex-modal-box" role="dialog" aria-modal="true" aria-label={`Edit ${field.label}`} onSubmit={submit}>
        <h3 className="ex-modal-title">Edit {field.label}</h3>
        <label className="field-label"><Icon name="edit" size={16} /> {field.label}</label>
        <div className={`password-wrapper ${isPassword ? "has-toggle" : ""}`}>
          <input
            autoFocus
            className="ex-input"
            type={isPassword ? (showValue ? "text" : "password") : (field.type || "text")}
            value={value}
            onChange={(event) => { setValue(event.target.value); setError(""); }}
            placeholder={field.placeholder || ""}
            autoComplete={isPassword ? "new-password" : undefined}
          />
          {isPassword ? <PasswordToggle visible={showValue} onToggle={() => setShowValue((current) => !current)} label="new password" /> : null}
        </div>

        <label className="field-label"><Icon name="lock" size={16} /> Current password</label>
        <div className="password-wrapper has-toggle">
          <input
            className="ex-input"
            type={showCurrentPassword ? "text" : "password"}
            value={currentPassword}
            onChange={(event) => { setCurrentPassword(event.target.value); setError(""); }}
            autoComplete="current-password"
          />
          <PasswordToggle visible={showCurrentPassword} onToggle={() => setShowCurrentPassword((current) => !current)} label="current password" />
        </div>

        {error ? <div className="ex-error" style={{ display: "block" }} role="alert">{error}</div> : null}
        <div className="ex-modal-actions">
          <button className="ex-btn ex-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Submit"}</button>
          <button className="ex-btn ex-danger" type="button" onClick={onClose} disabled={busy}>Close</button>
        </div>
      </form>
    </div>
  );
}

function ImageUploadModal({ imageRequest, onClose, onSaved }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kind = imageRequest?.kind === "cover" ? "cover" : "profile";

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);
  const label = kind === "cover" ? "Cover photo" : "Profile picture";

  async function submit(event) {
    event.preventDefault();
    if (!imageRequest?.file) return setError("Please choose an image first.");
    if (!text(currentPassword)) return setError("Current password is required.");
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/account/verify-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword }),
      }, { redirectOn401: false });
      const dataUrl = await imageDataUrl(imageRequest.file, kind);
      const endpoint = kind === "cover" ? "/api/account/cover-photo" : "/api/account/profile-picture";
      const result = await requestJson(endpoint, {
        method: "POST",
        body: JSON.stringify({ dataUrl, filename: imageRequest.file.name, currentPassword }),
      }, { redirectOn401: false });
      onSaved(kind, safeUrl(kind === "cover" ? result.coverPhotoUrl : result.photoUrl));
      onClose();
    } catch (uploadError) {
      setError(uploadError?.status === 401 ? "invalid password" : (uploadError?.message || "The image could not be uploaded."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ex-modal" style={{ display: "flex" }} aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="ex-modal-box" role="dialog" aria-modal="true" aria-label={`Change ${label}`} onSubmit={submit}>
        <h3 className="ex-modal-title">Change {label}</h3>
        {imageRequest?.preview ? (
          <div className={`account-image-preview account-image-preview--${kind}`} aria-label={`${label} preview`}>
            <img src={imageRequest.preview} alt={`${label} preview`} />
          </div>
        ) : null}
        <label className="field-label"><Icon name="image" size={16} /> Selected image</label>
        <div className="password-wrapper">
          <input className="ex-input" type="text" value={imageRequest?.file?.name || ""} readOnly />
        </div>
        <label className="field-label"><Icon name="lock" size={16} /> Current password</label>
        <div className="password-wrapper has-toggle">
          <input autoFocus className="ex-input" type={showCurrentPassword ? "text" : "password"} value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setError(""); }} autoComplete="current-password" />
          <PasswordToggle visible={showCurrentPassword} onToggle={() => setShowCurrentPassword((current) => !current)} label="current password" />
        </div>
        {error ? <div className="ex-error" style={{ display: "block" }} role="alert">{error}</div> : null}
        <div className="ex-modal-actions">
          <button className="ex-btn ex-primary" type="submit" disabled={busy}>{busy ? "Uploading..." : "Upload"}</button>
          <button className="ex-btn ex-danger" type="button" onClick={onClose} disabled={busy}>Close</button>
        </div>
      </form>
    </div>
  );
}

function RemoveImageModal({ kind, busy, onClose, onConfirm }) {
  const label = kind === "cover" ? "cover photo" : "profile picture";

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  return (
    <div className="account-confirm-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="account-confirm-card" role="dialog" aria-modal="true" aria-labelledby="account-remove-title">
        <span className="account-confirm-icon"><Icon name="alert" size={23} /></span>
        <h3 id="account-remove-title">Remove {label}?</h3>
        <p>You’re going to remove the current {label} and restore the default image. This action cannot be undone.</p>
        <div className="account-confirm-actions">
          <button className="account-confirm-cancel" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="account-confirm-remove" type="button" onClick={onConfirm} disabled={busy}>{busy ? "Removing…" : "Remove"}</button>
        </div>
      </section>
    </div>
  );
}

function fieldDisplay(account, field) {
  if (field.key === "password") return account.passwordSet ? "••••••••" : "—";
  return text(account?.[field.key]) || "—";
}

export default function AccountClient({ initialAccount }) {
  const [account, setAccount] = useState(() => normalizeAccount(initialAccount));
  const [editField, setEditField] = useState(null);
  const [imageRequest, setImageRequest] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [removeRequest, setRemoveRequest] = useState("");
  const profileInputRef = useRef(null);
  const coverInputRef = useRef(null);

  function showToast(type, title, message) {
    setToast({ type, title, message });
  }

  function syncAccountChrome(nextAccount) {
    const next = normalizeAccount(nextAccount || {});
    try {
      if (next.name) localStorage.setItem("username", next.name);
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent("user:updated", { detail: { account: next } }));
    } catch {
      try { window.dispatchEvent(new Event("user:updated")); } catch {}
    }
  }

  function closeImageModal() {
    if (imageRequest?.preview) URL.revokeObjectURL(imageRequest.preview);
    setImageRequest(null);
    if (profileInputRef.current) profileInputRef.current.value = "";
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function selectImage(kind, file) {
    if (!file) return;
    const isImage = lower(file.type).startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(file.name || "");
    if (!isImage) return showToast("error", "Invalid file", "Only image files can be used for the account profile.");
    if (file.size > 10 * 1024 * 1024) return showToast("error", "Image too large", "Please choose an image up to 10 MB.");
    setImageRequest({ kind, file, preview: URL.createObjectURL(file) });
  }

  async function removeImage(kind) {
    const label = kind === "cover" ? "cover photo" : "profile picture";
    setBusyAction(`remove-${kind}`);
    try {
      const endpoint = kind === "cover" ? "/api/account/cover-photo" : "/api/account/profile-picture";
      await requestJson(endpoint, { method: "DELETE" });
      const next = { ...account, [kind === "cover" ? "coverPhotoUrl" : "photoUrl"]: "" };
      setAccount(next);
      syncAccountChrome(next);
      setRemoveRequest("");
      showToast("success", "Removed", `${kind === "cover" ? "Cover photo" : "Profile picture"} removed successfully.`);
    } catch (error) {
      showToast("error", "Remove failed", error?.message || `The ${label} could not be removed.`);
    } finally {
      setBusyAction("");
    }
  }

  const displayName = account.name || "User";
  const subtitle = [account.department, account.position].filter(Boolean).join("  |  ") || "Team Member";
  const files = account.filesMedia;

  return (
    <section className="card account-page-shell">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div id="account-content">
        <div className="account-panel account-panel--profile account-profile-modern">
          <section className="profile-hero-section" aria-label="User profile header">
            <div className="profile-cover-section" data-field="coverPhoto">
              <button className="profile-cover-display" type="button" aria-label="Change cover photo" title="Change cover photo" onClick={() => coverInputRef.current?.click()}>
                {account.coverPhotoUrl ? <img className="profile-cover-image" src={account.coverPhotoUrl} alt={`${displayName} cover photo`} /> : <span className="profile-cover-fallback" aria-hidden="true" />}
              </button>
              {account.coverPhotoUrl ? (
                <button className="profile-cover-remove profile-image-remove" type="button" aria-label="Remove cover photo" title="Remove cover photo" onClick={() => setRemoveRequest("cover")} disabled={busyAction === "remove-cover"}>
                  <Icon name="x" size={18} />
                </button>
              ) : null}
              <button className="profile-cover-edit" type="button" aria-label="Edit cover photo" title="Edit cover photo" onClick={() => coverInputRef.current?.click()} disabled={busyAction === "remove-cover"}>
                <Icon name="edit" size={18} />
              </button>
              <input ref={coverInputRef} className="acc-file-input profile-cover-file-input" type="file" accept="image/*" hidden onChange={(event) => selectImage("cover", event.target.files?.[0])} />
            </div>

            <div className="profile-identity-block">
              <div className="profile-avatar-section" data-field="profilePicture">
                <div className="profile-avatar-shell">
                  <button className="profile-avatar-display" type="button" aria-label="Change profile picture" title="Change profile picture" onClick={() => profileInputRef.current?.click()}>
                    {account.photoUrl ? <img className="profile-avatar-image" src={account.photoUrl} width="142" height="142" alt={`${displayName} profile picture`} /> : <span className="profile-avatar-fallback" aria-hidden="true">{initials(displayName)}</span>}
                  </button>
                  <button className="profile-avatar-edit" type="button" aria-label="Edit profile picture" title="Edit profile picture" onClick={() => profileInputRef.current?.click()} disabled={busyAction === "remove-profile"}>
                    <Icon name="edit" size={18} />
                  </button>
                  {account.photoUrl ? (
                    <button className="profile-avatar-remove profile-image-remove" type="button" aria-label="Remove profile picture" title="Remove profile picture" onClick={() => setRemoveRequest("profile")} disabled={busyAction === "remove-profile"}>
                      <Icon name="x" size={18} />
                    </button>
                  ) : null}
                  <input ref={profileInputRef} className="acc-file-input profile-avatar-file-input" type="file" accept="image/*" hidden onChange={(event) => selectImage("profile", event.target.files?.[0])} />
                </div>
              </div>
              <h2 className="profile-identity-name">{displayName}</h2>
              <div className="profile-identity-subtitle">{subtitle}</div>
            </div>
          </section>

          <div className="profile-fields-list">
            {FIELD_META.map((field) => (
              <section className="profile-field-card" data-field={field.key} key={field.key}>
                <div className="profile-field-label">{field.label}</div>
                <div className={`profile-field-box ${field.key === "password" ? "profile-field-box--password" : ""}`}>
                  <span className="profile-field-value">{fieldDisplay(account, field)}</span>
                  <button className="profile-field-edit acc-action acc-edit" type="button" aria-label={`Edit ${field.label}`} title={`Edit ${field.label}`} onClick={() => setEditField(field)}>
                    <Icon name="edit" size={16} />
                  </button>
                </div>
              </section>
            ))}
          </div>

          <section className="profile-files-media-section" aria-label="Files and media">
            <div className="profile-files-media-head">
              <span className="profile-files-media-badge"><Icon name="paperclip" size={18} /></span>
              <div>
                <div className="profile-files-media-title">Files &amp; media</div>
                <div className="profile-files-media-sub">{files.length ? `${files.length} item${files.length === 1 ? "" : "s"} attached to your profile` : "Attachments from your Team Members record"}</div>
              </div>
            </div>
            <div className="profile-media-files-grid">
              {files.length ? files.map((file, index) => {
                const host = hostLabel(file.url);
                const inner = (
                  <>
                    <span className="profile-media-file-icon"><Icon name={fileIcon(file)} size={18} /></span>
                    <span className="profile-media-file-body"><span className="profile-media-file-name">{file.name || host || `File ${index + 1}`}</span>{host ? <span className="profile-media-file-url">{host}</span> : null}</span>
                    {file.url ? <span className="profile-media-file-open"><Icon name="external" size={17} /></span> : null}
                  </>
                );
                return file.url ? (
                  <a className="profile-media-file-card" href={file.url} target="_blank" rel="noopener noreferrer" key={`${file.name}-${index}`}>{inner}</a>
                ) : (
                  <div className="profile-media-file-card profile-media-file-card--disabled" key={`${file.name}-${index}`}>{inner}</div>
                );
              }) : (
                <div className="profile-media-empty">
                  <span className="profile-media-empty-icon"><Icon name="folder" size={18} /></span>
                  <span>No files or links added yet.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {editField ? (
        <EditFieldModal
          field={editField}
          account={account}
          onClose={() => setEditField(null)}
          onSaved={(next, message) => { setAccount(next); syncAccountChrome(next); showToast("success", "Saved", message); }}
        />
      ) : null}

      {imageRequest ? (
        <ImageUploadModal
          imageRequest={imageRequest}
          onClose={closeImageModal}
          onSaved={(kind, url) => {
            const next = { ...account, [kind === "cover" ? "coverPhotoUrl" : "photoUrl"]: url };
            setAccount(next);
            syncAccountChrome(next);
            showToast("success", "Saved", kind === "cover" ? "Cover photo updated successfully." : "Profile picture updated successfully.");
          }}
        />
      ) : null}

      {removeRequest ? (
        <RemoveImageModal
          kind={removeRequest}
          busy={busyAction === `remove-${removeRequest}`}
          onClose={() => { if (!busyAction) setRemoveRequest(""); }}
          onConfirm={() => removeImage(removeRequest)}
        />
      ) : null}
    </section>
  );
}
