"use client";

import { useMemo, useRef, useState } from "react";

const FIELD_META = [
  { key: "name", label: "Name", icon: "ID", type: "text", required: true, hint: "Displayed across the ERP and team directories." },
  { key: "department", label: "Department", icon: "DP", type: "text", hint: "Your assigned business department." },
  { key: "position", label: "Position", icon: "PS", type: "text", hint: "Your current role or job title." },
  { key: "phone", label: "Phone", icon: "PH", type: "tel", hint: "Used by internal teams when contact is required." },
  { key: "email", label: "Email", icon: "EM", type: "email", hint: "Your work or preferred contact email." },
  { key: "employeeCode", label: "Employee Code", icon: "#", type: "number", hint: "The internal employee identifier." },
  { key: "password", label: "Password", icon: "PW", type: "password", required: true, hint: "Changing it immediately updates your sign-in password." },
];

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function initials(name) {
  return text(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function safeUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^(https?:|data:|blob:|\/)/i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

function hostLabel(value) {
  const url = safeUrl(value);
  if (!url) return "File link unavailable";
  try {
    return new URL(url, "https://operations-hub.local").hostname || url;
  } catch {
    return url;
  }
}

function normalizeFiles(files) {
  return (Array.isArray(files) ? files : [])
    .map((file, index) => ({
      name: text(file?.name) || `File ${index + 1}`,
      url: safeUrl(file?.url || file?.external?.url || file?.file?.url),
      type: text(file?.type),
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
    allowedPages: Array.isArray(account?.allowedPages) ? account.allowedPages.map(text).filter(Boolean) : [],
    lmsAccess: account?.lmsAccess || null,
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
    let compressed = canvas.toDataURL("image/webp", 0.78);
    if (!compressed.startsWith("data:image/webp")) compressed = canvas.toDataURL("image/jpeg", 0.8);
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

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-account-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "My Account"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Modal({ title, subtitle, children, onClose, wide = false }) {
  return (
    <div className="next-account-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`next-account-modal__card ${wide ? "is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>AC</span>
          <div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="next-account-modal__body">{children}</div>
      </section>
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder = "Current password", autoFocus = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="next-account-password-input">
      <input
        autoFocus={autoFocus}
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <button type="button" onClick={() => setVisible((current) => !current)}>{visible ? "Hide" : "Show"}</button>
    </div>
  );
}

function EditFieldModal({ field, account, onClose, onSaved }) {
  const isPassword = field?.key === "password";
  const [value, setValue] = useState(isPassword ? "" : text(account?.[field?.key]));
  const [currentPassword, setCurrentPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const nextValue = field?.key === "employeeCode" ? text(value) : String(value ?? "").trim();
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
        body: JSON.stringify({ currentPassword, [field.key]: nextValue }),
      }, { redirectOn401: false });

      const refreshed = await requestJson("/api/account", {}, { redirectOn401: true });
      onSaved(normalizeAccount(refreshed), `${field.label} updated successfully.`);
      onClose();
    } catch (saveError) {
      setError(saveError?.status === 401 ? "Invalid current password." : (saveError?.message || "The account field could not be updated."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit ${field.label}`} subtitle={field.hint} onClose={onClose}>
      <form className="next-account-form" onSubmit={submit}>
        <label>
          <span>{isPassword ? "New password" : field.label}{field.required ? " *" : ""}</span>
          {isPassword ? (
            <div className="next-account-password-input">
              <input
                autoFocus
                type={showNewPassword ? "text" : "password"}
                autoComplete="new-password"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Enter a new password"
              />
              <button type="button" onClick={() => setShowNewPassword((current) => !current)}>{showNewPassword ? "Hide" : "Show"}</button>
            </div>
          ) : (
            <input autoFocus type={field.type || "text"} value={value} onChange={(event) => setValue(event.target.value)} />
          )}
        </label>
        <label><span>Current password *</span><PasswordInput value={currentPassword} onChange={setCurrentPassword} /></label>
        {error ? <div className="next-account-error">{error}</div> : null}
        <footer>
          <button type="button" className="next-account-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="next-account-btn primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </footer>
      </form>
    </Modal>
  );
}

function ImageUploadModal({ imageRequest, onClose, onSaved }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kind = imageRequest?.kind === "cover" ? "cover" : "profile";
  const title = kind === "cover" ? "Update cover photo" : "Update profile picture";

  async function submit(event) {
    event.preventDefault();
    if (!imageRequest?.file) return setError("Choose an image first.");
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
      setError(uploadError?.status === 401 ? "Invalid current password." : (uploadError?.message || "The image could not be uploaded."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} subtitle="The image is compressed in your browser before it is uploaded." onClose={onClose}>
      <form className="next-account-form" onSubmit={submit}>
        <div className={`next-account-image-preview is-${kind}`}>
          {imageRequest?.preview ? <img src={imageRequest.preview} alt="Selected preview" /> : <span>No preview</span>}
        </div>
        <div className="next-account-file-summary">
          <strong>{imageRequest?.file?.name || "Selected image"}</strong>
          <span>{imageRequest?.file ? `${(imageRequest.file.size / 1024 / 1024).toFixed(2)} MB` : ""}</span>
        </div>
        <label><span>Current password *</span><PasswordInput autoFocus value={currentPassword} onChange={setCurrentPassword} /></label>
        {error ? <div className="next-account-error">{error}</div> : null}
        <footer>
          <button type="button" className="next-account-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="next-account-btn primary" disabled={busy}>{busy ? "Uploading…" : "Upload image"}</button>
        </footer>
      </form>
    </Modal>
  );
}

function fieldDisplay(account, field) {
  if (field.key === "password") return account.passwordSet ? "Password configured" : "No password configured";
  const value = text(account?.[field.key]);
  return value || "Not provided";
}

export default function AccountClient({ initialAccount }) {
  const [account, setAccount] = useState(() => normalizeAccount(initialAccount));
  const [editField, setEditField] = useState(null);
  const [imageRequest, setImageRequest] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const profileInputRef = useRef(null);
  const coverInputRef = useRef(null);

  const access = useMemo(() => {
    const allowed = new Set(account.allowedPages.map(lower));
    const lmsPages = Array.isArray(account?.lmsAccess?.pages)
      ? account.lmsAccess.pages.filter((page) => page?.isEnabled !== false)
      : [];
    return {
      allowedCount: allowed.size,
      lmsCount: lmsPages.length,
      adminCount: Array.isArray(account?.pageAccess?.pages)
        ? account.pageAccess.pages.filter((page) => lower(page?.accessLevel || page?.access_level) === "admin" && page?.isEnabled !== false).length
        : 0,
      history: ["history", "system history", "audit history", "audit log", "system audit", "/history"].some((name) => allowed.has(name)),
      backup: ["backup", "back up", "database", "system database", "system backup", "/backup"].some((name) => allowed.has(name)),
    };
  }, [account]);

  function showToast(type, title, message) {
    setToast({ type, title, message });
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
    if (file.size > 10 * 1024 * 1024) return showToast("error", "Image too large", "Choose an image that is 10 MB or smaller.");
    const preview = URL.createObjectURL(file);
    setImageRequest({ kind, file, preview });
  }

  async function removeImage(kind) {
    const label = kind === "cover" ? "cover photo" : "profile picture";
    if (!window.confirm(`Remove the current ${label}?`)) return;
    setBusyAction(`remove-${kind}`);
    try {
      const endpoint = kind === "cover" ? "/api/account/cover-photo" : "/api/account/profile-picture";
      await requestJson(endpoint, { method: "DELETE" });
      setAccount((current) => ({ ...current, [kind === "cover" ? "coverPhotoUrl" : "photoUrl"]: "" }));
      showToast("success", "Image removed", `The ${label} was removed successfully.`);
    } catch (error) {
      showToast("error", "Remove failed", error?.message || `The ${label} could not be removed.`);
    } finally {
      setBusyAction("");
    }
  }

  async function logout() {
    if (!window.confirm("Sign out from Operations Hub?")) return;
    setBusyAction("logout");
    try {
      await requestJson("/api/logout", { method: "POST" }, { redirectOn401: false });
      window.location.href = "/login";
    } catch (error) {
      showToast("error", "Logout failed", error?.message || "Your session could not be closed.");
      setBusyAction("");
    }
  }

  const files = account.filesMedia;

  return (
    <section className="next-account-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <article className="next-account-profile-card">
        <div className="next-account-cover">
          {account.coverPhotoUrl ? <img src={account.coverPhotoUrl} alt="Account cover" /> : <div className="next-account-cover__fallback"><span>Operations Hub</span><b>Personal workspace</b></div>}
          <div className="next-account-cover__actions">
            <button type="button" onClick={() => coverInputRef.current?.click()}>Change cover</button>
            {account.coverPhotoUrl ? <button type="button" className="danger" onClick={() => removeImage("cover")} disabled={busyAction === "remove-cover"}>{busyAction === "remove-cover" ? "Removing…" : "Remove"}</button> : null}
          </div>
          <input ref={coverInputRef} hidden type="file" accept="image/*" onChange={(event) => selectImage("cover", event.target.files?.[0])} />
        </div>

        <div className="next-account-identity">
          <div className="next-account-avatar-wrap">
            <button type="button" className="next-account-avatar" onClick={() => profileInputRef.current?.click()} aria-label="Change profile picture">
              {account.photoUrl ? <img src={account.photoUrl} alt="Profile" /> : <span>{initials(account.name)}</span>}
            </button>
            <button type="button" className="next-account-avatar-edit" onClick={() => profileInputRef.current?.click()}>Edit</button>
            {account.photoUrl ? <button type="button" className="next-account-avatar-remove" onClick={() => removeImage("profile")} disabled={busyAction === "remove-profile"}>×</button> : null}
            <input ref={profileInputRef} hidden type="file" accept="image/*" onChange={(event) => selectImage("profile", event.target.files?.[0])} />
          </div>
          <div className="next-account-identity__copy">
            <span>MY PROFILE</span>
            <h2>{account.name || "Operations Hub user"}</h2>
            <p>{[account.position, account.department].filter(Boolean).join(" · ") || "Complete your account information to help the team identify you."}</p>
          </div>
          <div className="next-account-identity__stats">
            <div><strong>{access.allowedCount}</strong><span>ERP pages</span></div>
            <div><strong>{access.lmsCount}</strong><span>LMS pages</span></div>
            <div><strong>{access.adminCount}</strong><span>Admin access</span></div>
          </div>
        </div>
      </article>

      <div className="next-account-layout">
        <div className="next-account-main-column">
          <article className="next-account-section">
            <header><div><span>PERSONAL INFORMATION</span><h3>Account details</h3><p>Edit one field at a time. Your current password is required before saving.</p></div></header>
            <div className="next-account-fields-grid">
              {FIELD_META.map((field) => (
                <article className={`next-account-field-card ${field.key === "password" ? "is-security" : ""}`} key={field.key}>
                  <span className="next-account-field-card__icon">{field.icon}</span>
                  <div><small>{field.label}</small><strong className={!text(account?.[field.key]) && field.key !== "password" ? "is-empty" : ""}>{fieldDisplay(account, field)}</strong><p>{field.hint}</p></div>
                  <button type="button" onClick={() => setEditField(field)}>Edit</button>
                </article>
              ))}
            </div>
          </article>

          <article className="next-account-section">
            <header><div><span>FILES & MEDIA</span><h3>Shared profile files</h3><p>Files assigned to your team-member record are available here for quick access.</p></div><em>{files.length} files</em></header>
            {files.length ? (
              <div className="next-account-files-grid">
                {files.map((file, index) => (
                  <a className={`next-account-file-card ${file.url ? "" : "is-disabled"}`} href={file.url || undefined} target={file.url ? "_blank" : undefined} rel="noreferrer" key={`${file.name}-${index}`}>
                    <span>FILE</span>
                    <div><strong>{file.name}</strong><small>{file.url ? hostLabel(file.url) : "No public URL"}</small></div>
                    <b>{file.url ? "Open ↗" : "Unavailable"}</b>
                  </a>
                ))}
              </div>
            ) : (
              <div className="next-account-empty"><span>0</span><div><strong>No shared files</strong><p>Files added to your user record will appear in this section.</p></div></div>
            )}
          </article>
        </div>

        <aside className="next-account-side-column">
          <article className="next-account-security-card">
            <span>SECURITY</span>
            <h3>Protect your account</h3>
            <p>Every profile change is checked against your current password before it is saved.</p>
            <button type="button" onClick={() => setEditField(FIELD_META.find((field) => field.key === "password"))}>Change password</button>
          </article>

          <article className="next-account-shortcuts">
            <header><span>WORKSPACE</span><h3>Account shortcuts</h3></header>
            <a href="/next/how-it-works"><div><strong>How it works</strong><small>Guides and operating instructions</small></div><b>→</b></a>
            <a href="/next/app-install"><div><strong>Install Operations Hub</strong><small>PWA installation and device app status</small></div><b>→</b></a>
            {access.history ? <a href="/next/history"><div><strong>System history</strong><small>Review recorded ERP actions</small></div><b>→</b></a> : null}
            {access.backup ? <a href="/next/backup"><div><strong>Database backup</strong><small>Export and restore system data</small></div><b>→</b></a> : null}
            <a href="/account"><div><strong>Classic profile</strong><small>Open the previous account interface</small></div><b>↗</b></a>
          </article>

          <button type="button" className="next-account-logout" onClick={logout} disabled={busyAction === "logout"}>{busyAction === "logout" ? "Signing out…" : "Sign out"}</button>
        </aside>
      </div>

      {editField ? (
        <EditFieldModal
          field={editField}
          account={account}
          onClose={() => setEditField(null)}
          onSaved={(next, message) => { setAccount(next); showToast("success", "Saved", message); }}
        />
      ) : null}

      {imageRequest ? (
        <ImageUploadModal
          imageRequest={imageRequest}
          onClose={closeImageModal}
          onSaved={(kind, url) => {
            setAccount((current) => ({ ...current, [kind === "cover" ? "coverPhotoUrl" : "photoUrl"]: url }));
            showToast("success", "Image updated", kind === "cover" ? "Cover photo updated successfully." : "Profile picture updated successfully.");
          }}
        />
      ) : null}
    </section>
  );
}
