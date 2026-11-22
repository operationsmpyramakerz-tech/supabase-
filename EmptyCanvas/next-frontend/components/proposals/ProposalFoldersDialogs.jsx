"use client";

import { useMemo, useState } from "react";

// Same nested destination semantics as Kits: any depth + Main Proposals.
const nameOf = (value) => String(value ?? "").trim();

function destinationsFromFolders(folders) {
  const all = Array.isArray(folders) ? folders : [];
  const byId = new Map(all.filter((item) => nameOf(item.id)).map((item) => [nameOf(item.id), item]));
  const children = new Map();
  for (const folder of byId.values()) {
    const id = nameOf(folder.id);
    const rawParent = nameOf(folder.parentFolderId);
    const parent = rawParent && rawParent !== id && byId.has(rawParent) ? rawParent : "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(folder);
  }
  for (const group of children.values()) {
    group.sort((a, b) => nameOf(a.name).localeCompare(nameOf(b.name)));
  }
  const destinations = [{ id: "", name: "Main Proposals", path: "Main Proposals",
    parentPath: "", count: 0, childrenCount: (children.get("") || []).length }];
  const visited = new Set();
  const descend = (parentId, parts) => {
    for (const folder of children.get(parentId) || []) {
      const id = nameOf(folder.id);
      if (visited.has(id)) continue;
      visited.add(id);
      const next = [...parts, nameOf(folder.name) || "Untitled folder"];
      destinations.push({
        id, name: next[next.length - 1],
        path: ["Main Proposals", ...next].join(" / "),
        parentPath: ["Main Proposals", ...parts].join(" / "),
        count: Number(folder.proposalCount || 0),
        childrenCount: (children.get(id) || []).length,
      });
      descend(id, next);
    }
  };
  descend("", []);
  // Orphan/cyclic data cannot hide destinations from the user.
  for (const folder of byId.values()) {
    if (visited.has(nameOf(folder.id))) continue;
    const id = nameOf(folder.id);
    visited.add(id);
    destinations.push({
      id, name: nameOf(folder.name) || "Untitled folder",
      path: "Main Proposals / " + (nameOf(folder.name) || "Untitled folder"),
      parentPath: "Main Proposals",
      count: Number(folder.proposalCount || 0),
      childrenCount: (children.get(id) || []).length,
    });
    descend(id, [nameOf(folder.name) || "Untitled folder"]);
  }
  return destinations;
}

export function MoveProposalModal({ dialog, folders, busy, onClose, onSubmit }) {
  const [selected, setSelected] = useState(nameOf(dialog?.proposal?.folderId));
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const destinations = useMemo(() => destinationsFromFolders(folders), [folders]);
  const filtered = useMemo(() => destinations.filter((item) =>
    item.path.toLowerCase().includes(query.trim().toLowerCase())), [destinations, query]);
  const currentId = nameOf(dialog?.proposal?.folderId);
  const destination = destinations.find((item) => item.id === selected);
  const submit = async (event) => {
    event.preventDefault();
    if (selected === currentId) return;
    if (!destination) return setError("Choose an existing destination.");
    setError("");
    try { await onSubmit(selected); }
    catch (err) { setError(err?.message || "Unable to move proposal."); }
  };
  return (
    <div className="products-modal-overlay proposal-folder-move-overlay" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="products-modal proposal-folder-move-modal" role="dialog" aria-modal="true"
        aria-label="Move Proposal">
        <header className="proposal-folder-move-heading">
          <div><span>ORGANIZE PROPOSALS</span><h2>Move Proposal</h2>
            <p>Choose where “{dialog?.proposal?.name || "this proposal"}” should be moved.</p></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close move proposal">×</button>
        </header>
        <form onSubmit={submit} className="proposal-folder-move-form">
          <label className="proposal-folder-move-search">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search folders or paths..." aria-label="Search destination folders" />
          </label>
          <div className="proposal-folder-move-list" role="radiogroup" aria-label="Destination">
            {filtered.map((item) => (
              <button key={item.id || "root"} type="button" role="radio"
                aria-checked={selected === item.id}
                className={`proposal-folder-move-card${selected === item.id ? " is-selected" : ""}`}
                onClick={() => { setSelected(item.id); setError(""); }} disabled={busy}>
                <span className="proposal-folder-move-figure" aria-hidden="true"><i/><i/><i/></span>
                <span className="proposal-folder-move-copy">
                  <strong>{item.name}</strong>
                  <small>{item.id ? `${item.count} proposals · ${item.childrenCount} folders` : "Root directory"}</small>
                  <em>{item.parentPath || "Main Proposals"}</em>
                </span>
                {selected === item.id ? <span className="proposal-folder-move-selected">✓</span> : null}
              </button>
            ))}
            {!filtered.length && <p className="proposal-folder-move-empty">No matching folders.</p>}
          </div>
          <div className="proposal-folder-move-destination">
            <span>Destination</span><strong>{destination?.path || "Main Proposals"}</strong>
          </div>
          {error ? <div className="next-proposals-error products-form-error" role="alert">{error}</div> : null}
          <div className="products-modal__actions proposal-folder-move-actions">
            <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="products-btn products-btn--dark" disabled={busy || selected === currentId}>
              {busy ? "Moving…" : "Move Proposal"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
