"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.74 3h15.12A2 2 0 0 0 21.3 17L13.7 3.7a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function useDialogLifecycle({ onCancel, busy }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  useEffect(() => {
    if (!mounted) return undefined;
    document.body.classList.add("system-delete-dialog-open");
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel?.();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.classList.remove("system-delete-dialog-open");
      document.removeEventListener("keydown", onKey, true);
    };
  }, [mounted, busy, onCancel]);
  return mounted;
}

function DialogFrame({ title, message, onCancel, busy, children, actions, labelledBy = "systemDeleteTitle", describedBy = "systemDeleteMessage" }) {
  const mounted = useDialogLifecycle({ onCancel, busy });
  if (!mounted) return null;
  return createPortal(
    <div className="system-delete-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel?.(); }}>
      <div className="system-delete-dialog__backdrop" aria-hidden="true" onMouseDown={() => { if (!busy) onCancel?.(); }} />
      <section className="system-delete-dialog__card" role="alertdialog" aria-modal="true" aria-labelledby={labelledBy} aria-describedby={message ? describedBy : undefined} onMouseDown={(event) => event.stopPropagation()}>
        <div className="system-delete-dialog__icon"><WarningIcon /></div>
        <h2 id={labelledBy}>{title || "Delete item"}</h2>
        {message ? <p id={describedBy} className="system-delete-dialog__message">{message}</p> : null}
        {children ? <div className="system-delete-dialog__content">{children}</div> : null}
        <div className="system-delete-dialog__actions">{actions}</div>
      </section>
    </div>,
    document.body,
  );
}

export function DeleteConfirmDialog({
  title = "Delete item",
  message = "You’re going to permanently delete this item. This action cannot be undone.",
  busy = false,
  error = "",
  onCancel,
  onConfirm,
  cancelLabel = "No, keep it.",
  confirmLabel = "Yes, Delete!",
  busyLabel = "Deleting…",
  confirmDisabled = false,
  children = null,
}) {
  return (
    <DialogFrame
      title={title}
      message={message}
      onCancel={onCancel}
      busy={busy}
      actions={<>
        <button type="button" className="system-delete-dialog__button system-delete-dialog__button--cancel" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
        <button type="button" className="system-delete-dialog__button system-delete-dialog__button--confirm" onClick={onConfirm} disabled={busy || confirmDisabled}>{busy ? busyLabel : confirmLabel}</button>
      </>}
    >
      {children}
      {error ? <div className="system-delete-dialog__error" role="alert">{error}</div> : null}
    </DialogFrame>
  );
}

export function DeleteVerificationDialog({
  title = "Delete item",
  password,
  onPasswordChange,
  busy = false,
  error = "",
  onCancel,
  onSubmit,
  cancelLabel = "No, keep it.",
  confirmLabel = "Yes, Delete!",
  busyLabel = "Verifying…",
}) {
  return (
    <DialogFrame
      title={title}
      message=""
      onCancel={onCancel}
      busy={busy}
      labelledBy="systemDeleteVerifyTitle"
      describedBy="systemDeleteVerifyMessage"
      actions={<>
        <button type="button" className="system-delete-dialog__button system-delete-dialog__button--cancel" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
        <button type="submit" form="system-delete-verification-form" className="system-delete-dialog__button system-delete-dialog__button--confirm" disabled={busy || !String(password || "").trim()}>{busy ? busyLabel : confirmLabel}</button>
      </>}
    >
      <form id="system-delete-verification-form" className="system-delete-dialog__verify" onSubmit={(event) => { event.preventDefault(); onSubmit?.(String(password || "").trim()); }}>
        <label htmlFor="system-delete-admin-password">Admin password</label>
        <input id="system-delete-admin-password" type="password" autoFocus autoComplete="current-password" value={password || ""} onChange={(event) => onPasswordChange?.(event.target.value)} placeholder="••••••••" disabled={busy} />
      </form>
      {error ? <div className="system-delete-dialog__error" role="alert" aria-live="polite">{error}</div> : null}
    </DialogFrame>
  );
}
