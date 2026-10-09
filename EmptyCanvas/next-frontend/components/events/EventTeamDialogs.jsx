"use client";

import { useEffect, useRef, useState } from "react";
import EventIcon from "./EventIcon";
import { DeleteConfirmDialog } from "../shared/SystemDeleteDialogs";

const ROLE_LABELS = Object.freeze({ instructor: "Instructor", usher: "Usher", organizer: "Organizer" });

const EMPTY_MEMBER = Object.freeze({
  id: "",
  role: "instructor",
  name: "",
  phone: "",
  email: "",
  governorate: "",
  instapay: "",
  wallet: "",
  station: "",
  idPhotoUrl: "",
  notes: "",
  isActive: true,
});

function text(value) {
  return String(value ?? "").trim();
}

function normalizePhone(value) {
  return text(value).replace(/\s+/g, "");
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
    throw new Error(text(payload?.error || payload?.message) || `Request failed with status ${response.status}.`);
  }
  return payload;
}

function memberToForm(member, fallbackRole = "instructor") {
  return {
    ...EMPTY_MEMBER,
    id: text(member?.id),
    role: text(member?.role) || fallbackRole || "instructor",
    name: text(member?.name),
    phone: text(member?.phone),
    email: text(member?.email),
    governorate: text(member?.governorate),
    instapay: text(member?.instapay),
    wallet: text(member?.wallet),
    station: text(member?.station),
    idPhotoUrl: text(member?.idPhotoUrl),
    notes: text(member?.notes),
    isActive: member?.isActive !== false,
  };
}

function Modal({ children, onClose, label }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="events-modal-overlay event-team-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section className="events-modal event-team-modal" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>
  );
}

export function EventTeamMemberDialog({ member = null, role = "instructor", onClose, onSaved }) {
  const [memberForm, setMemberForm] = useState(() => memberToForm(member, role));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const idInputRef = useRef(null);

  async function uploadIdPhoto(file) {
    if (!file) return;
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      setFormError("ID must be uploaded as an image.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const { compressImage } = await import("./EventComponentAssetProcessing");
      const prepared = await compressImage(file);
      const payload = await requestJson("/next/api/events/team", {
        method: "POST",
        body: JSON.stringify({ action: "upload-id", dataUrl: prepared.dataUrl, fileName: prepared.fileName || file.name }),
      });
      if (!text(payload?.url)) throw new Error("The uploaded ID image did not return a URL.");
      setMemberForm((current) => ({ ...current, idPhotoUrl: text(payload.url) }));
    } catch (error) {
      setFormError(error?.message || "Could not upload the ID image.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMember(event) {
    event.preventDefault();
    if (busy) return;
    if (!text(memberForm.name)) {
      setFormError("Name is required.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const editing = !!text(memberForm.id);
      const payload = await requestJson("/next/api/events/team", {
        method: "POST",
        body: JSON.stringify({
          action: editing ? "update-member" : "create-member",
          id: memberForm.id,
          payload: {
            ...memberForm,
            phone: normalizePhone(memberForm.phone),
            instapay: normalizePhone(memberForm.instapay),
            wallet: normalizePhone(memberForm.wallet),
          },
        }),
      });
      if (!payload?.member?.id) throw new Error("The saved team member was not returned.");
      onSaved?.(payload.member, { editing });
      onClose?.();
    } catch (error) {
      setFormError(error?.message || "Could not save the team member.");
    } finally {
      setBusy(false);
    }
  }

  const editing = !!text(memberForm.id);

  return (
    <Modal
      label={`${editing ? "Edit" : "Add"} ${ROLE_LABELS[memberForm.role] || "team member"}`}
      onClose={() => {
        if (!busy) onClose?.();
      }}
    >
      <form onSubmit={saveMember}>
        <div className="event-team-modal__head">
          <div>
            <span>{editing ? "Edit team member" : "New team member"}</span>
            <h3>{ROLE_LABELS[memberForm.role] || "Event Team"}</h3>
          </div>
          <button type="button" className="event-team-modal__close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </div>

        <div className="event-team-form-grid">
          <label><span>Role</span><select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))}><option value="instructor">Instructor</option><option value="usher">Usher</option><option value="organizer">Organizer</option></select></label>
          <label><span>Name *</span><input value={memberForm.name} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" autoFocus /></label>
          <label><span>Phone</span><input inputMode="tel" value={memberForm.phone} onChange={(event) => setMemberForm((current) => ({ ...current, phone: event.target.value }))} placeholder="01xxxxxxxxx" /></label>
          <label><span>Email</span><input type="email" value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" /></label>
          <label><span>Governorate</span><input value={memberForm.governorate} onChange={(event) => setMemberForm((current) => ({ ...current, governorate: event.target.value }))} placeholder="Cairo" /></label>
          <label><span>Station</span><input value={memberForm.station} onChange={(event) => setMemberForm((current) => ({ ...current, station: event.target.value }))} placeholder="e.g. 3D Printer" /></label>
          <label><span>InstaPay</span><input inputMode="tel" value={memberForm.instapay} onChange={(event) => setMemberForm((current) => ({ ...current, instapay: event.target.value }))} placeholder="InstaPay number" /></label>
          <label><span>Wallet</span><input inputMode="tel" value={memberForm.wallet} onChange={(event) => setMemberForm((current) => ({ ...current, wallet: event.target.value }))} placeholder="Wallet number" /></label>
          <label className="event-team-field--wide"><span>ID image</span><div className="event-team-id-upload"><input ref={idInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) uploadIdPhoto(file); }} /><button type="button" onClick={() => idInputRef.current?.click()} disabled={busy}><EventIcon name="image" /> {memberForm.idPhotoUrl ? "Replace ID" : "Upload ID"}</button>{memberForm.idPhotoUrl ? <a href={memberForm.idPhotoUrl} target="_blank" rel="noreferrer"><img src={memberForm.idPhotoUrl} alt="ID preview" /></a> : <span>No ID uploaded</span>}</div></label>
          <label className="event-team-field--wide"><span>Notes</span><textarea rows="3" value={memberForm.notes} onChange={(event) => setMemberForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional notes" /></label>
          <label className="event-team-toggle event-team-field--wide"><input type="checkbox" checked={memberForm.isActive} onChange={(event) => setMemberForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>Active team member</span></label>
        </div>

        {formError ? <div className="event-team-form-error">{formError}</div> : null}
        <div className="event-team-modal__actions"><button type="button" className="events-secondary-btn" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="events-primary-btn" disabled={busy}>{busy ? "Saving..." : "Save"}</button></div>
      </form>
    </Modal>
  );
}

export function EventTeamDeleteDialog({ member, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    if (!member?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      await requestJson("/next/api/events/team", {
        method: "POST",
        body: JSON.stringify({ action: "delete-member", id: member.id }),
      });
      onDeleted?.(member);
      onClose?.();
    } catch (requestError) {
      setError(requestError?.message || "Could not delete the team member.");
    } finally {
      setBusy(false);
    }
  }

  return <DeleteConfirmDialog
    title="Delete team member?"
    message={`${text(member?.name) || "This person"} will be permanently removed from the event team.`}
    busy={busy}
    error={error}
    onCancel={onClose}
    onConfirm={confirmDelete}
  />;
}
