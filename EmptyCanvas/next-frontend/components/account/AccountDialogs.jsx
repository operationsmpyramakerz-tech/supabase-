"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function text(value) {
  return String(value ?? "").trim();
}

function safeUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^(https?:|data:|blob:|\/)/i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
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

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(String(dataUrl || ""));
  if (!response.ok) throw new Error("The prepared image could not be converted for upload.");
  return await response.blob();
}

async function loadImage(dataUrl) {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected image could not be prepared."));
    image.src = dataUrl;
  });
}

async function croppedImageDataUrl(file, crop, viewportWidth, viewportHeight) {
  const raw = await readFileAsDataUrl(file);
  const image = await loadImage(raw);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const frameWidth = Math.max(1, Number(viewportWidth) || 360);
  const frameHeight = Math.max(1, Number(viewportHeight) || 360);
  const zoom = Math.max(1, Math.min(3, Number(crop?.zoom) || 1));
  const baseScale = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight);
  const displayScale = baseScale * zoom;
  const cropWidth = Math.min(sourceWidth, frameWidth / displayScale);
  const cropHeight = Math.min(sourceHeight, frameHeight / displayScale);
  const centerX = (sourceWidth / 2) - ((Number(crop?.x) || 0) / displayScale);
  const centerY = (sourceHeight / 2) - ((Number(crop?.y) || 0) / displayScale);
  const sx = Math.max(0, Math.min(sourceWidth - cropWidth, centerX - cropWidth / 2));
  const sy = Math.max(0, Math.min(sourceHeight - cropHeight, centerY - cropHeight / 2));

  const outputWidth = 900;
  const outputHeight = 900;
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
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    lock: <><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    alert: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.7 20.7 0 0 1 5.06-6.94"/><path d="M1 1l22 22"/><path d="M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-.88"/></>,
  };
  return <svg {...common}>{paths[name] || paths.edit}</svg>;
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

export function EditFieldModal({ field, account, onClose, onSaved }) {
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
      await requestJson("/next/api/account", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, [field.key]: normalizedValue || null }),
      }, { redirectOn401: false });

      const refreshed = await requestJson("/next/api/account", {}, { redirectOn401: true });
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

export function ImageUploadModal({ imageRequest, onClose, onSaved }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalidPassword, setInvalidPassword] = useState(false);
  const [crop, setCrop] = useState({ zoom: 1, x: 0, y: 0 });
  const [imageMeta, setImageMeta] = useState({ width: 0, height: 0 });
  const cropViewportRef = useRef(null);
  const passwordInputRef = useRef(null);
  const invalidPasswordTimerRef = useRef(null);
  const dragRef = useRef(null);
  const kind = "profile";
  const label = "Profile picture";

  useEffect(() => {
    setCrop({ zoom: 1, x: 0, y: 0 });
    setImageMeta({ width: 0, height: 0 });
    setError("");
    setInvalidPassword(false);
    if (invalidPasswordTimerRef.current) {
      window.clearTimeout(invalidPasswordTimerRef.current);
      invalidPasswordTimerRef.current = null;
    }
  }, [imageRequest?.preview, kind]);

  useEffect(() => () => {
    if (invalidPasswordTimerRef.current) window.clearTimeout(invalidPasswordTimerRef.current);
  }, []);

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

  function triggerInvalidPassword() {
    if (invalidPasswordTimerRef.current) window.clearTimeout(invalidPasswordTimerRef.current);
    setCurrentPassword("");
    setShowCurrentPassword(false);
    setError("");
    setInvalidPassword(true);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([70, 45, 90]);
      }
    } catch {}
    window.requestAnimationFrame(() => passwordInputRef.current?.focus());
    invalidPasswordTimerRef.current = window.setTimeout(() => {
      setInvalidPassword(false);
      invalidPasswordTimerRef.current = null;
    }, 1650);
  }

  async function submit(event) {
    event.preventDefault();
    if (!imageRequest?.file) return setError("Please choose an image first.");
    if (!text(currentPassword)) return setError("Current password is required.");
    setBusy(true);
    setError("");
    try {
      await requestJson("/next/api/account/verify-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword }),
      }, { redirectOn401: false });

      const viewport = cropViewportRef.current?.getBoundingClientRect();
      const dataUrl = await croppedImageDataUrl(
        imageRequest.file,
        crop,
        viewport?.width,
        viewport?.height,
      );
      const blob = await dataUrlToBlob(dataUrl);
      if (!blob.size) throw new Error("The prepared image is empty.");
      if (blob.size > 10 * 1024 * 1024) throw new Error("Image is too large. Maximum size is 10MB.");

      const ticket = await requestJson("/next/api/account/image-upload-ticket", {
        method: "POST",
        body: JSON.stringify({
          kind,
          filename: imageRequest.file.name,
          mime: blob.type || "image/webp",
          size: blob.size,
          currentPassword,
        }),
      }, { redirectOn401: false });

      const uploadResponse = await fetch(ticket?.upload?.signedUrl || "", {
        method: ticket?.upload?.method || "PUT",
        headers: ticket?.upload?.headers || {},
        body: blob,
      });
      if (!uploadResponse.ok) {
        throw new Error(`Image upload failed with status ${uploadResponse.status}.`);
      }

      const result = await requestJson("/next/api/account/image-direct", {
        method: "POST",
        body: JSON.stringify({ kind, path: ticket.path || ticket?.upload?.path, currentPassword }),
      }, { redirectOn401: false });
      onSaved("profile", safeUrl(result.photoUrl));
      onClose();
    } catch (uploadError) {
      if (uploadError?.status === 401) triggerInvalidPassword();
      else setError(uploadError?.message || "The image could not be uploaded.");
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
              <p>Drag the image to choose the visible area, then zoom if needed.</p>
            </div>
          </div>
          <button className="account-image-editor-close" type="button" onClick={onClose} disabled={busy} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>

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

        <div className="account-image-editor-filename"><Icon name="image" size={15} /><span>{imageRequest?.file?.name || "Selected image"}</span></div>

        <label className="field-label"><Icon name="lock" size={16} /> Current password</label>
        <div className={`password-wrapper has-toggle account-image-editor-password${invalidPassword ? " is-invalid-password" : ""}`}>
          <input
            ref={passwordInputRef}
            className="ex-input"
            type={showCurrentPassword ? "text" : "password"}
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              setError("");
              if (invalidPassword) {
                setInvalidPassword(false);
                if (invalidPasswordTimerRef.current) {
                  window.clearTimeout(invalidPasswordTimerRef.current);
                  invalidPasswordTimerRef.current = null;
                }
              }
            }}
            autoComplete="current-password"
            placeholder={invalidPassword ? "invalid password" : "Enter your current password"}
            aria-invalid={invalidPassword || !!error}
          />
          <PasswordToggle visible={showCurrentPassword} onToggle={() => setShowCurrentPassword((current) => !current)} label="current password" />
        </div>
        {error ? <div className="ex-error" style={{ display: "block" }} role="alert">{error}</div> : null}
        <div className="ex-modal-actions account-image-editor-actions">
          <button className="ex-btn account-image-editor-cancel" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="ex-btn ex-primary account-image-editor-save" type="submit" disabled={busy}>{busy ? "Saving…" : "Save photo"}</button>
        </div>
      </form>
    </div>
  );
}

export function RemoveImageModal({ kind, busy, onClose, onConfirm }) {
  const label = "profile picture";

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="account-confirm-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="account-confirm-card account-remove-image-modal" role="alertdialog" aria-modal="true" aria-labelledby="account-remove-title" aria-describedby="account-remove-description">
        <button className="account-confirm-close" type="button" aria-label="Close confirmation" onClick={onClose} disabled={busy}>
          <Icon name="x" size={18} />
        </button>
        <span className="account-confirm-icon" aria-hidden="true"><Icon name="alert" size={22} /></span>
        <div className="account-confirm-copy">
          <h3 id="account-remove-title">Remove {label}?</h3>
          <p id="account-remove-description">This will remove the current {label} and restore the default image. This action cannot be undone.</p>
        </div>
        <div className="account-confirm-actions">
          <button className="account-confirm-cancel" type="button" onClick={onClose} disabled={busy} autoFocus>Cancel</button>
          <button className="account-confirm-remove" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? <span className="account-confirm-spinner" aria-hidden="true" /> : null}
            <span>{busy ? "Removing…" : "Remove"}</span>
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

