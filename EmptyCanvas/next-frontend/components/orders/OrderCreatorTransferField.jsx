"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";

const clean = (value) => String(value ?? "").trim();

export default function OrderCreatorTransferField({
  members = [], originalId = "", originalName = "", selectedId = "",
  onChange, disabled = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const controlRef = useRef(null);
  const queryRef = useRef(null);

  const options = useMemo(() =>
    (Array.isArray(members) ? members : [])
      .filter((item) => clean(item?.id) && clean(item?.name))
      .sort((a, b) => clean(a.name).localeCompare(clean(b.name))),
  [members]);

  const selected = options.find((member) => clean(member.id) === clean(selectedId));
  const current = options.find((member) => clean(member.id) === clean(originalId));
  const label = selected?.name || (clean(selectedId) ? "Unknown user" : clean(originalName) || "Select a user");
  const changed = Boolean(clean(selectedId) && clean(selectedId) !== clean(originalId));
  const filtered = options.filter((member) => {
    const term = search.trim().toLocaleLowerCase();
    return !term || [member.name, member.department, member.position].some((value) =>
      clean(value).toLocaleLowerCase().includes(term));
  });

  useEffect(() => {
    if (!expanded) return undefined;
    const onOutside = (event) => {
      if (controlRef.current && !controlRef.current.contains(event.target)) {
        setExpanded(false);
        setSearch("");
      }
    };
    const onEscape = (event) => {
      if (event.key === "Escape") { setExpanded(false); setSearch(""); }
    };
    document.addEventListener("pointerdown", onOutside);
    window.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      window.removeEventListener("keydown", onEscape);
    };
  }, [expanded]);

  return (
    <section className="ops-creator-transfer" aria-label="Order Creator" ref={controlRef}>
      <div className="ops-creator-transfer__heading">
        <span className="ops-creator-transfer__icon" aria-hidden="true"><ClassicOrderIcon name="user" /></span>
        <span className="ops-creator-transfer__copy">
          <strong>Order Creator</strong>
          <small>{changed ? "Change pending — Save changes to transfer ownership" : "Current order owner"}</small>
        </span>
        {changed ? <span className="ops-creator-transfer__changed">Changed</span> : null}
      </div>
      <button type="button" className="ops-creator-transfer__trigger" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={expanded}
        onClick={() => { setExpanded((value) => !value); setSearch(""); }}>
        <span className="ops-creator-transfer__avatar" aria-hidden="true">
          {label === "Select a user" ? "?" : label.charAt(0).toLocaleUpperCase()}
        </span>
        <span className="ops-creator-transfer__selected">
          <strong>{label}</strong>
          <small>{changed ? `Previously: ${clean(originalName) || current?.name || "Unassigned"}` : "Assigned user"}</small>
        </span>
        <span className="ops-creator-transfer__chevron" aria-hidden="true">
          <ClassicOrderIcon name="chevron-down" />
        </span>
      </button>
      {expanded ? (
        <div className="ops-creator-transfer__menu">
          <label className="ops-creator-transfer__search">
            <ClassicOrderIcon name="search" />
            <input ref={queryRef} type="search" value={search}
              placeholder="Search team members…" aria-label="Search team members"
              onChange={(event) => setSearch(event.target.value)} disabled={disabled} />
          </label>
          <div role="listbox" aria-label="Select Order Creator" className="ops-creator-transfer__options">
            {filtered.map((member) => {
              const active = clean(member.id) === clean(selectedId);
              return (
                <button key={clean(member.id)} role="option" aria-selected={active}
                  className={`ops-creator-transfer__option${active ? " is-selected" : ""}`}
                  type="button" disabled={disabled}
                  onClick={() => { onChange?.(clean(member.id)); setExpanded(false); setSearch(""); }}>
                  <span className="ops-creator-transfer__mini-avatar" aria-hidden="true">
                    {clean(member.name).charAt(0).toLocaleUpperCase()}
                  </span>
                  <span className="ops-creator-transfer__option-text">
                    <strong>{clean(member.name)}</strong>
                    {clean(member.department || member.position) ? <small>{clean(member.department || member.position)}</small> : null}
                  </span>
                  {active ? <span className="ops-creator-transfer__tick" aria-hidden="true">✓</span> : null}
                </button>
              );
            })}
            {!filtered.length ? <p className="ops-creator-transfer__empty">No matching users.</p> : null}
          </div>
        </div>
      ) : null}
      {changed ? <div className="ops-creator-transfer__warning" role="status">
        The order will move to the selected user's My Orders. Already delivered Stocktaking balances will not move automatically.
      </div> : null}
    </section>
  );
}
