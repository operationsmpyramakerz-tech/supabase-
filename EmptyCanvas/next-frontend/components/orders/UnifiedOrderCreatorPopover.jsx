"use client";

import { useEffect } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";

const clean = (value) => String(value ?? "").trim();
const token = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");

function fieldValue(profile, aliases) {
  const wanted = new Set(aliases.map(token));
  const match = Object.entries(profile || {}).find(([key, value]) => wanted.has(token(key)) && clean(value));
  if (match) return clean(match[1]);
  const field = (Array.isArray(profile?.fields) ? profile.fields : []).find((item) =>
    wanted.has(token(item?.label || item?.name || item?.key)) && clean(item?.value));
  return clean(field?.value);
}

function safeUrl(value) {
  const url = clean(value);
  return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? url : "";
}

// Keep the card attached to its trigger, but never let it leave the viewport.
// A compact bottom sheet is easier to use than a tiny popover on narrow phones.
export function creatorPopoverPlacement(anchor) {
  if (!anchor || typeof window === "undefined") return {};
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(366, viewportWidth - 24);
  const mobile = viewportWidth <= 600;
  if (mobile) return { mobile: true };
  const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, viewportWidth - width - 12));
  const roomBelow = viewportHeight - rect.bottom - 23;
  const roomAbove = rect.top - 23;
  const above = roomBelow < 340 && roomAbove > roomBelow;
  const available = above ? roomAbove : roomBelow;
  const maxHeight = Math.max(150, Math.min(520, available));
  // Use bottom anchoring when opening upward so short profiles still touch the trigger.
  const top = above ? undefined : rect.bottom + 10;
  const bottom = above ? viewportHeight - rect.top + 10 : undefined;
  const arrowX = Math.max(22, Math.min(width - 22, rect.left + rect.width / 2 - left));
  return { left, top, bottom, maxHeight, above, arrowX, mobile: false };
}

function CreatorRow({ label, value, icon, href }) {
  if (!value) return null;
  return <div className="unified-creator__row">
    <span className="unified-creator__row-icon"><ClassicOrderIcon name={icon} /></span>
    <span className="unified-creator__row-label">{label}</span>
    {href ? <a href={href} className="unified-creator__row-value">{value}</a> : <strong className="unified-creator__row-value">{value}</strong>}
  </div>;
}

export default function UnifiedOrderCreatorPopover({ state, onClose }) {
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    const onOutside = (event) => {
      if (!event.target.closest?.(".unified-creator, .co-creator-btn, .next-current-creator-chip")) onClose();
    };
    const onMove = () => onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside, true);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [state, onClose]);

  if (!state) return null;
  const profile = state.profile || {};
  const name = fieldValue(profile, ["name", "full name", "username"]) || clean(state.name) || "Creator";
  const department = fieldValue(profile, ["department", "dept"]);
  const position = fieldValue(profile, ["position", "job title", "title"]);
  const email = fieldValue(profile, ["email", "email address"]);
  const phone = fieldValue(profile, ["phone", "mobile", "phone number"]);
  const employeeCode = fieldValue(profile, ["employee code", "employee id", "code"]);
  const photoUrl = safeUrl(profile.photoUrl || profile.profilePicture || profile.profile_picture);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
  const files = (Array.isArray(profile.filesMedia) ? profile.filesMedia : Array.isArray(profile.files_media) ? profile.files_media : [])
    .map((file) => ({ name: clean(file?.name || file?.filename || file?.title) || "Attachment", url: safeUrl(file?.url || file?.href) }));
  const placement = state.placement || {};
  const style = placement.mobile ? undefined : {
    left: placement.left ?? state.left,
    top: placement.above ? "auto" : (placement.top ?? state.top),
    bottom: placement.above ? placement.bottom : "auto",
    maxHeight: placement.maxHeight ?? state.maxHeight ?? 520,
    "--creator-arrow-x": `${placement.arrowX ?? 300}px`,
  };
  return <div
    className={`creator-profile-popover is-open unified-creator${placement.above ? " unified-creator--above" : ""}${placement.mobile ? " unified-creator--mobile" : ""}`}
    style={style} role="dialog" aria-modal="false" aria-label={`Created by ${name}`}>
    {!placement.mobile ? <svg className="unified-creator__pointer" viewBox="0 0 36 19" aria-hidden="true">
      <path d="M1 19 C8 19 11 8 15 4 C17.5 1.2 19.5 1.2 22 4 C26 8 29 19 35 19 Z" />
    </svg> : null}
    <div className="unified-creator__surface">
      <div className="unified-creator__header">
        <div className={`unified-creator__avatar${photoUrl ? " unified-creator__avatar--photo" : ""}`}>
          {photoUrl ? <img src={photoUrl} alt="" /> : initials}
        </div>
        <div className="unified-creator__identity">
          <span className="unified-creator__eyebrow">CREATED BY</span>
          <strong className="unified-creator__name">{name}</strong>
          {position || department ? <span className="unified-creator__role">{position || department}</span> : null}
        </div>
        <button type="button" onClick={onClose} className="unified-creator__close" aria-label="Close creator details"><ClassicOrderIcon name="x" /></button>
      </div>
      {state.loading ? <div className="unified-creator__status" role="status">Loading creator details…</div>
        : state.error ? <div className="unified-creator__status" role="status">More creator details aren't available.</div>
        : <div className="unified-creator__body">
          <CreatorRow icon="layers" label="Department" value={department} />
          <CreatorRow icon="user" label="Position" value={position} />
          <CreatorRow icon="mail" label="Email" value={email} href={email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : undefined} />
          <CreatorRow icon="phone" label="Phone" value={phone} href={phone && /^[+\d()\s-]{6,25}$/.test(phone) ? `tel:${phone.replace(/[^+\d]/g, "")}` : undefined} />
          <CreatorRow icon="file-text" label="Employee code" value={employeeCode} />
          {files.length ? <div className="unified-creator__files">
            <div className="unified-creator__files-title"><ClassicOrderIcon name="clipboard" />Files &amp; media <span>{files.length}</span></div>
            {files.map((file, index) => file.url ? <a key={`${index}-${file.name}`} className="unified-creator__file" href={file.url} target="_blank" rel="noopener noreferrer"><ClassicOrderIcon name="file-text" /><span>{file.name}</span><ClassicOrderIcon name="external-link" /></a> : <div className="unified-creator__file unified-creator__file--disabled" key={`${index}-${file.name}`}><ClassicOrderIcon name="file-text" /><span>{file.name}</span></div>)}
          </div> : null}
          {!department && !position && !email && !phone && !employeeCode && !files.length ? <div className="unified-creator__status">No additional profile information available.</div> : null}
        </div>}
    </div>
  </div>;
}
