"use client";

import { useEffect, useState } from "react";
import { loadTeamMemberPublicProfile } from "../../lib/team-member-public-client";
import ClassicOrderIcon from "./ClassicOrderIcon";

function extractField(profile, aliases) {
  if (!profile || typeof profile !== "object") return "";
  const wanted = new Set(aliases.map((label) => label.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const topLevel = Object.entries(profile).find(([key, value]) => wanted.has(key.toLowerCase().replace(/[^a-z0-9]/g, "")) && typeof value === "string" && value.trim());
  if (topLevel) return topLevel[1].trim();
  const field = (Array.isArray(profile.fields) ? profile.fields : []).find((item) => wanted.has(String(item?.label || item?.name || item?.key || "").toLowerCase().replace(/[^a-z0-9]/g, "")) && item?.value);
  return String(field?.value || "").trim();
}

export default function CurrentOrderCreatorPopover({ creator, onClose }) {
  const [profileState, setProfileState] = useState({ loading: true, profile: null, error: false });
  useEffect(() => {
    let mounted = true;
    const identifier = creator?.id || creator?.name;
    setProfileState({ loading: !!identifier, profile: null, error: false });
    if (identifier) {
      loadTeamMemberPublicProfile(identifier)
        .then((profile) => { if (mounted) setProfileState({ loading: false, profile, error: false }); })
        .catch(() => { if (mounted) setProfileState({ loading: false, profile: null, error: true }); });
    }
    return () => { mounted = false; };
  }, [creator?.id, creator?.name]);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    const closeOutside = (event) => {
      if (!event.target.closest?.(".orders-workspace-current-creator, .next-current-creator-chip")) onClose();
    };
    const closeOnScroll = () => onClose();
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [onClose]);

  const profile = profileState.profile;
  const name = extractField(profile, ["name", "full name", "username"]) || creator.name || "Creator";
  const department = extractField(profile, ["department", "dept"]);
  const position = extractField(profile, ["position", "job title", "title"]);
  const email = extractField(profile, ["email", "email address"]);
  const phone = extractField(profile, ["phone", "mobile", "phone number"]);
  const spaceUnder = window.innerHeight - creator.top - 16;
  const showAbove = spaceUnder < 180 && creator.above > 180;
  const popupHeight = Math.min(300, window.innerHeight - 24);
  const top = showAbove ? Math.max(12, creator.above - popupHeight - 8) : Math.min(creator.top, window.innerHeight - popupHeight - 12);
  return (
    <div className="orders-workspace-current-creator" style={{ left: creator.left, top, maxHeight: popupHeight }} role="dialog" aria-label="Order creator profile">
      <button type="button" className="orders-workspace-current-creator__close" aria-label="Close creator profile" onClick={onClose}><ClassicOrderIcon name="x" /></button>
      <div className="orders-workspace-current-creator__heading">Created by</div>
      <strong>{name}</strong>
      {profileState.loading ? <p>Loading profile…</p> : profileState.error ? <p>More profile details are unavailable.</p> : (
        <div className="orders-workspace-current-creator__details">
          {[ ["Position", position], ["Department", department], ["Email", email], ["Phone", phone] ].filter(([,value]) => value).map(([label, value]) => (
            <div key={label}><span>{label}</span><b>{value}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}
