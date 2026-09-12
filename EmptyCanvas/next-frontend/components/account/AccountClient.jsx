"use client";

import { useEffect, useRef, useState } from "react";

const FIELD_META = [
  {
    key: "name",
    label: "Username",
    type: "text",
    required: true,
    placeholder: "Enter username",
    helper: "This name is shown across the system.",
    maxLength: 80,
    autoComplete: "username",
  },
  {
    key: "department",
    label: "Department",
    type: "text",
    placeholder: "Add department",
    helper: "Your primary team or department.",
    maxLength: 80,
    autoComplete: "organization",
  },
  {
    key: "position",
    label: "Position",
    type: "text",
    placeholder: "Add position",
    helper: "Your current role or job title.",
    maxLength: 100,
    autoComplete: "organization-title",
  },
  {
    key: "phone",
    label: "Phone",
    type: "tel",
    placeholder: "Add phone number",
    helper: "Use a reachable phone number.",
    maxLength: 32,
    inputMode: "tel",
    autoComplete: "tel",
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    placeholder: "Add email address",
    helper: "Use an email address you can access.",
    maxLength: 160,
    inputMode: "email",
    autoComplete: "email",
  },
  {
    key: "employeeCode",
    label: "Employee code",
    type: "text",
    placeholder: "Add employee code",
    helper: "Numbers only.",
    maxLength: 30,
    inputMode: "numeric",
    autoComplete: "off",
  },
  {
    key: "password",
    label: "Password",
    type: "password",
    required: true,
    placeholder: "Enter a new password",
    helper: "Use at least 8 characters.",
    maxLength: 128,
    autoComplete: "new-password",
  },
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

async function croppedImageDataUrl(file, kind, crop, viewportWidth, viewportHeight) {
  const raw = await readFileAsDataUrl(file);
  const image = await loadImage(raw);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const frameWidth = Math.max(1, Number(viewportWidth) || (kind === "cover" ? 680 : 360));
  const frameHeight = Math.max(1, Number(viewportHeight) || (kind === "cover" ? 200 : 360));
  const zoom = Math.max(1, Math.min(3, Number(crop?.zoom) || 1));
  const baseScale = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight);
  const displayScale = baseScale * zoom;
  const cropWidth = Math.min(sourceWidth, frameWidth / displayScale);
  const cropHeight = Math.min(sourceHeight, frameHeight / displayScale);
  const centerX = (sourceWidth / 2) - ((Number(crop?.x) || 0) / displayScale);
  const centerY = (sourceHeight / 2) - ((Number(crop?.y) || 0) / displayScale);
  const sx = Math.max(0, Math.min(sourceWidth - cropWidth, centerX - cropWidth / 2));
  const sy = Math.max(0, Math.min(sourceHeight - cropHeight, centerY - cropHeight / 2));

  const outputWidth = kind === "cover" ? 1700 : 900;
  const outputHeight = kind === "cover" ? 500 : 900;
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("The image crop could not be prepared.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sx, sy, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  let result = canvas.toDataURL("image/webp", kind === "cover" ? 0.84 : 0.88);
  if (!result.startsWith("data:image/webp")) result = canvas.toDataURL("image/jpeg", kind === "cover" ? 0.86 : 0.9);
  return result;
}

async function fittedCoverImageDataUrl(file) {
  const raw = await readFileAsDataUrl(file);
  const image = await loadImage(raw);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const maxWidth = 2400;
  const maxHeight = 1800;
  const resizeScale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  const outputWidth = Math.max(1, Math.round(sourceWidth * resizeScale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * resizeScale));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("The cover image could not be prepared.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);

  let result = canvas.toDataURL("image/webp", 0.88);
  if (!result.startsWith("data:image/webp")) result = canvas.toDataURL("image/jpeg", 0.9);
  return result;
}

function clampCropOffset(value, displaySize, frameSize) {
  const limit = Math.max(0, (displaySize - frameSize) / 2);
  return Math.max(-limit, Math.min(limit, Number(value) || 0));
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
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></>,
    moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>,
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

function normalizeEditValue(field, rawValue) {
  return String(rawValue ?? "").trim();
}

function validateEditValue(field, rawValue) {
  const value = normalizeEditValue(field, rawValue);
  if (field?.required && !value) return `${field.label} is required.`;
  if (!value) return "";

  if (field?.maxLength && value.length > field.maxLength) {
    return `${field.label} must be ${field.maxLength} characters or fewer.`;
  }

  if (field?.key === "name" && value.length < 2) {
    return "Username must be at least 2 characters.";
  }
  if (field?.key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value)) {
    return "Enter a valid email address.";
  }
  if (field?.key === "phone" && !/^\+?[0-9][0-9\s().-]{5,30}$/.test(value)) {
    return "Enter a valid phone number.";
  }
  if (field?.key === "employeeCode" && !/^\d+$/.test(value)) {
    return "Employee code can contain numbers only.";
  }
  if (field?.key === "password" && value.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return "";
}

function EditFieldModal({ field, account, onClose, onSaved }) {
  const isPassword = field?.key === "password";
  const originalValue = isPassword ? "" : text(account?.[field?.key]);
  const [value, setValue] = useState(originalValue);
  const [currentPassword, setCurrentPassword] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [valueTouched, setValueTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const valueInputRef = useRef(null);

  const normalizedValue = normalizeEditValue(field, value);
  const dirty = isPassword ? normalizedValue.length > 0 : normalizedValue !== originalValue;
  const valueError = valueTouched ? validateEditValue(field, value) : "";
  const passwordError = passwordTouched && !text(currentPassword) ? "Current password is required." : "";
  const canSubmit = dirty && !busy;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => valueInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function requestClose() {
    if (busy) return;
    if (dirty) {
      setDiscardPrompt(true);
      return;
    }
    onClose();
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, dirty]);

  async function submit(event) {
    event.preventDefault();
    setValueTouched(true);
    setPasswordTouched(true);
    setDiscardPrompt(false);
    setServerError("");

    const fieldError = validateEditValue(field, value);
    if (fieldError || !dirty || !text(currentPassword)) return;

    setBusy(true);
    try {
      // PATCH already verifies the current password. Avoiding a separate verify request
      // keeps the save flow faster while preserving the same server-side protection.
      await requestJson("/api/account", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, [field.key]: normalizedValue || null }),
      }, { redirectOn401: false });

      const refreshed = await requestJson("/api/account", {}, { redirectOn401: true });
      onSaved(normalizeAccount(refreshed), `${field.label} updated successfully.`);
      onClose();
    } catch (saveError) {
      const message = saveError?.status === 401
        ? "The current password is incorrect."
        : (saveError?.message || "We couldn't save this change. Please try again.");
      setServerError(message);
    } finally {
      setBusy(false);
    }
  }

  const valueErrorId = `account-edit-${field.key}-error`;
  const passwordErrorId = `account-edit-${field.key}-password-error`;
  const helperId = `account-edit-${field.key}-helper`;
  const titleId = `account-edit-${field.key}-title`;
  const descriptionId = `account-edit-${field.key}-description`;

  return (
    <div
      className="ex-modal account-edit-field-layer"
      style={{ display: "flex" }}
      aria-hidden="false"
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <form
        className="ex-modal-box account-edit-field-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        onSubmit={submit}
      >
        <header className="account-edit-field-head">
          <div className="account-edit-field-headcopy">
            <span className="account-edit-field-icon" aria-hidden="true"><Icon name={isPassword ? "lock" : "edit"} size={20} /></span>
            <div>
              <div className="account-edit-field-title-row">
                <h3 className="ex-modal-title" id={titleId}>Edit {field.label}</h3>
                {dirty ? <span className="account-edit-dirty-badge">Unsaved</span> : null}
              </div>
              <p id={descriptionId}>{isPassword ? "Choose a new password, then confirm with your current password." : "Update this detail, then confirm with your current password to save securely."}</p>
            </div>
          </div>
          <button className="account-edit-field-close" type="button" onClick={requestClose} disabled={busy} aria-label="Close edit dialog"><Icon name="x" size={18} /></button>
        </header>

        <div className="account-edit-field-body">
          <div className="account-edit-control-group">
            <div className="account-edit-label-row">
              <label htmlFor={`account-edit-${field.key}`}>{field.label}{field.required ? <span className="account-edit-required" aria-hidden="true">*</span> : null}</label>
              {!isPassword && field.maxLength ? <span className="account-edit-count">{normalizedValue.length}/{field.maxLength}</span> : null}
            </div>
            <div className={`account-edit-input-shell ${isPassword ? "account-edit-input-shell--password" : ""} ${valueError ? "is-invalid" : dirty ? "is-dirty" : ""}`}>
              <input
                ref={valueInputRef}
                id={`account-edit-${field.key}`}
                className="ex-input account-edit-input"
                type={isPassword ? (showValue ? "text" : "password") : (field.type || "text")}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setServerError("");
                  setDiscardPrompt(false);
                  if (valueTouched) setValueTouched(true);
                }}
                onBlur={() => setValueTouched(true)}
                placeholder={field.placeholder || ""}
                autoComplete={field.autoComplete || undefined}
                inputMode={field.inputMode || undefined}
                maxLength={field.maxLength || undefined}
                autoCapitalize={["name", "email", "employeeCode"].includes(field.key) ? "none" : undefined}
                autoCorrect={["name", "email", "phone", "employeeCode", "password"].includes(field.key) ? "off" : undefined}
                spellCheck={["name", "email", "phone", "employeeCode", "password"].includes(field.key) ? false : undefined}
                aria-invalid={!!valueError}
                aria-describedby={`${helperId}${valueError ? ` ${valueErrorId}` : ""}`}
              />
              {isPassword ? <PasswordToggle visible={showValue} onToggle={() => setShowValue((current) => !current)} label="new password" /> : null}
            </div>
            <div className="account-edit-support-row">
              <span className="account-edit-helper" id={helperId}>{field.helper || "Changes apply after you save."}</span>
              {dirty && !valueError ? <span className="account-edit-valid"><Icon name="check" size={14} /> Ready</span> : null}
            </div>
            {valueError ? <div className="account-edit-inline-error" id={valueErrorId} role="alert"><Icon name="alert" size={15} />{valueError}</div> : null}
          </div>

          <div className="account-edit-security-card">
            <div className="account-edit-security-copy">
              <span className="account-edit-security-icon" aria-hidden="true"><Icon name="lock" size={17} /></span>
              <div><strong>Confirm your identity</strong><span>Enter your current password to authorize this change.</span></div>
            </div>
            <div className={`account-edit-input-shell account-edit-password-shell ${passwordError ? "is-invalid" : ""}`}>
              <input
                id={`account-edit-${field.key}-current-password`}
                className="ex-input account-edit-input"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setServerError("");
                  setDiscardPrompt(false);
                }}
                onBlur={() => setPasswordTouched(true)}
                placeholder="Current password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={!!passwordError}
                aria-describedby={passwordError ? passwordErrorId : undefined}
              />
              <PasswordToggle visible={showCurrentPassword} onToggle={() => setShowCurrentPassword((current) => !current)} label="current password" />
            </div>
            {passwordError ? <div className="account-edit-inline-error" id={passwordErrorId} role="alert"><Icon name="alert" size={15} />{passwordError}</div> : null}
          </div>

          {serverError ? <div className="account-edit-server-error" role="alert"><Icon name="alert" size={17} /><div><strong>Couldn't save changes</strong><span>{serverError}</span></div></div> : null}

          {discardPrompt ? (
            <div className="account-edit-discard" role="alert">
              <div><strong>Discard unsaved changes?</strong><span>Your changes to {field.label.toLowerCase()} will be lost.</span></div>
              <div className="account-edit-discard-actions">
                <button type="button" onClick={() => setDiscardPrompt(false)}>Keep editing</button>
                <button type="button" className="is-danger" onClick={onClose}>Discard</button>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="account-edit-field-actions">
          <button className="account-edit-cancel" type="button" onClick={requestClose} disabled={busy}>Cancel</button>
          <button className="account-edit-save" type="submit" disabled={!canSubmit}>
            {busy ? <><span className="account-edit-spinner" aria-hidden="true" />Saving…</> : <><Icon name="check" size={17} />Save changes</>}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ImageUploadModal({ imageRequest, onClose, onSaved }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [crop, setCrop] = useState({ zoom: 1, x: 0, y: 0 });
  const [imageMeta, setImageMeta] = useState({ width: 0, height: 0 });
  const cropViewportRef = useRef(null);
  const dragRef = useRef(null);
  const kind = imageRequest?.kind === "cover" ? "cover" : "profile";
  const label = kind === "cover" ? "Cover photo" : "Profile picture";

  useEffect(() => {
    setCrop({ zoom: 1, x: 0, y: 0 });
    setImageMeta({ width: 0, height: 0 });
    setError("");
  }, [imageRequest?.preview, kind]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  function clampPosition(x, y, zoom) {
    const viewport = cropViewportRef.current;
    if (!viewport || !imageMeta.width || !imageMeta.height) return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    const baseScale = Math.max(rect.width / imageMeta.width, rect.height / imageMeta.height);
    const displayWidth = imageMeta.width * baseScale * zoom;
    const displayHeight = imageMeta.height * baseScale * zoom;
    return {
      x: clampCropOffset(x, displayWidth, rect.width),
      y: clampCropOffset(y, displayHeight, rect.height),
    };
  }

  function changeZoom(value) {
    const zoom = Math.max(1, Math.min(3, Number(value) || 1));
    setCrop((current) => {
      const position = clampPosition(current.x, current.y, zoom);
      return { zoom, ...position };
    });
  }

  function resetCrop() {
    setCrop({ zoom: 1, x: 0, y: 0 });
  }

  function handlePointerDown(event) {
    if (busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cropX: crop.x,
      cropY: crop.y,
    };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || busy) return;
    const nextX = drag.cropX + (event.clientX - drag.startX);
    const nextY = drag.cropY + (event.clientY - drag.startY);
    setCrop((current) => ({ ...current, ...clampPosition(nextX, nextY, current.zoom) }));
  }

  function handlePointerEnd(event) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
  }

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

      const viewport = cropViewportRef.current?.getBoundingClientRect();
      const dataUrl = kind === "cover"
        ? await fittedCoverImageDataUrl(imageRequest.file)
        : await croppedImageDataUrl(
            imageRequest.file,
            kind,
            crop,
            viewport?.width,
            viewport?.height,
          );
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
    <div className="ex-modal account-image-editor-layer" style={{ display: "flex" }} aria-hidden="false">
      <form className={`ex-modal-box account-image-editor account-image-editor--${kind}`} role="dialog" aria-modal="true" aria-label={`Change ${label}`} onSubmit={submit}>
        <div className="account-image-editor-head">
          <div className="account-image-editor-headcopy">
            <span className="account-image-editor-icon"><Icon name="image" size={20} /></span>
            <div>
              <h3 className="ex-modal-title">Change {label}</h3>
              <p>{kind === "profile" ? "Drag the image to choose the visible area, then zoom if needed." : "The full cover image will be saved without cropping and fitted automatically across the system."}</p>
            </div>
          </div>
          <button className="account-image-editor-close" type="button" onClick={onClose} disabled={busy} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>

        {kind === "profile" ? (
          <>
            <div className="account-crop-stage">
              <div
                ref={cropViewportRef}
                className="account-crop-viewport account-crop-viewport--profile"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                aria-label="Crop profile picture"
              >
                {imageRequest?.preview ? (
                  <img
                    className="account-crop-image"
                    src={imageRequest.preview}
                    alt="Profile picture crop preview"
                    draggable="false"
                    onLoad={(event) => {
                      const element = event.currentTarget;
                      setImageMeta({ width: element.naturalWidth || 1, height: element.naturalHeight || 1 });
                      setCrop({ zoom: 1, x: 0, y: 0 });
                    }}
                    style={{ transform: `translate3d(${crop.x}px, ${crop.y}px, 0) scale(${crop.zoom})` }}
                  />
                ) : null}
                <span className="account-crop-grid" aria-hidden="true" />
                <span className="account-crop-profile-ring" aria-hidden="true" />
              </div>
              <div className="account-crop-hint">Drag to reposition</div>
            </div>

            <div className="account-crop-controls">
              <span className="account-crop-zoom-label">Zoom</span>
              <input
                className="account-crop-zoom"
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={crop.zoom}
                onChange={(event) => changeZoom(event.target.value)}
                aria-label="Zoom image"
              />
              <button className="account-crop-reset" type="button" onClick={resetCrop} disabled={busy}>Reset</button>
            </div>
          </>
        ) : (
          <div className="account-cover-fit-stage">
            <div className="account-cover-fit-preview" aria-label="Cover photo preview">
              {imageRequest?.preview ? <img src={imageRequest.preview} alt="Cover photo preview" draggable="false" /> : null}
            </div>
            <div className="account-cover-fit-note">Full image • no crop • automatic system fit</div>
          </div>
        )}

        <div className="account-image-editor-filename"><Icon name="image" size={15} /><span>{imageRequest?.file?.name || "Selected image"}</span></div>

        <label className="field-label"><Icon name="lock" size={16} /> Current password</label>
        <div className="password-wrapper has-toggle account-image-editor-password">
          <input className="ex-input" type={showCurrentPassword ? "text" : "password"} value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setError(""); }} autoComplete="current-password" placeholder="Enter your current password" />
          <PasswordToggle visible={showCurrentPassword} onToggle={() => setShowCurrentPassword((current) => !current)} label="current password" />
        </div>
        {error ? <div className="ex-error" style={{ display: "block" }} role="alert">{error}</div> : null}
        <div className="ex-modal-actions account-image-editor-actions">
          <button className="ex-btn account-image-editor-cancel" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="ex-btn ex-primary account-image-editor-save" type="submit" disabled={busy}>{busy ? "Saving…" : `Save ${kind === "cover" ? "cover" : "photo"}`}</button>
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

function fieldHasValue(account, field) {
  if (field.key === "password") return account.passwordSet === true;
  return Boolean(text(account?.[field.key]));
}

function fieldDisplay(account, field) {
  if (field.key === "password") return account.passwordSet ? "••••••••" : (field.placeholder || "Set password");
  return text(account?.[field.key]) || field.placeholder || "Not added";
}

const THEME_STORAGE_KEY = "ops_ui_theme_v1";

function currentTheme() {
  if (typeof document === "undefined") return "light";
  const fromRoot = String(document.documentElement?.dataset?.theme || "").toLowerCase();
  if (fromRoot === "dark" || fromRoot === "light") return fromRoot;
  try {
    const stored = String(localStorage.getItem(THEME_STORAGE_KEY) || "").toLowerCase();
    if (stored === "dark" || stored === "light") return stored;
  } catch {}
  return "light";
}

function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  if (typeof document === "undefined") return next;
  const root = document.documentElement;
  root.dataset.theme = next;
  root.classList.toggle("ops-theme-dark", next === "dark");
  root.style.colorScheme = next;
  const themeColor = document.getElementById("ops-theme-color");
  if (themeColor) themeColor.setAttribute("content", next === "dark" ? "#080b11" : "#ffffff");
  try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch {}
  try {
    document.cookie = `${THEME_STORAGE_KEY}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {}
  try { window.dispatchEvent(new CustomEvent("ops:theme-changed", { detail: { theme: next } })); } catch {}
  return next;
}

export default function AccountClient({ initialAccount }) {
  const [account, setAccount] = useState(() => normalizeAccount(initialAccount));
  const [editField, setEditField] = useState(null);
  const [imageRequest, setImageRequest] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [removeRequest, setRemoveRequest] = useState("");
  const [theme, setTheme] = useState("light");
  const profileInputRef = useRef(null);
  const coverInputRef = useRef(null);

  useEffect(() => {
    const syncTheme = () => setTheme(currentTheme());
    syncTheme();
    const handleThemeChanged = (event) => {
      const next = String(event?.detail?.theme || currentTheme()).toLowerCase();
      setTheme(next === "dark" ? "dark" : "light");
    };
    const handleStorage = (event) => {
      if (!event || event.key === THEME_STORAGE_KEY) syncTheme();
    };
    window.addEventListener("ops:theme-changed", handleThemeChanged);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("ops:theme-changed", handleThemeChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(applyTheme(next));
  }

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

          <section className="profile-appearance-section" aria-label="Appearance settings">
            <div className="profile-appearance-row">
              <span className="profile-appearance-icon" aria-hidden="true"><Icon name={theme === "dark" ? "moon" : "sun"} size={18} /></span>
              <div className="profile-appearance-copy">
                <div className="profile-appearance-label">Theme</div>
                <div className="profile-appearance-value">{theme === "dark" ? "Dark mode" : "Light mode"}</div>
              </div>
              <button
                type="button"
                className={`profile-theme-switch ${theme === "dark" ? "is-dark" : ""}`}
                role="switch"
                aria-checked={theme === "dark"}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                onClick={toggleTheme}
              >
                <span className="profile-theme-switch__track" aria-hidden="true">
                  <span className="profile-theme-switch__thumb">
                    <Icon name={theme === "dark" ? "moon" : "sun"} size={14} />
                  </span>
                </span>
              </button>
            </div>
          </section>

          <div className="profile-fields-list">
            {FIELD_META.map((field) => {
              const hasValue = fieldHasValue(account, field);
              return (
                <section className="profile-field-card" data-field={field.key} key={field.key}>
                  <div className={`profile-field-box ${field.key === "password" ? "profile-field-box--password" : ""}`}>
                    <div className="profile-field-copy">
                      <div className="profile-field-label">{field.label}</div>
                      <span className={`profile-field-value ${hasValue ? "" : "is-placeholder"}`}>{fieldDisplay(account, field)}</span>
                    </div>
                    <button className="profile-field-edit acc-action acc-edit" type="button" aria-label={`Edit ${field.label}`} title={`Edit ${field.label}`} onClick={() => setEditField(field)}>
                      <Icon name="edit" size={16} />
                    </button>
                  </div>
                </section>
              );
            })}
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
