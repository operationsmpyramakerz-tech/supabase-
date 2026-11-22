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
  /* ERP_PROPOSALS_KITS_PARITY_V2: full-width bottom sheet, same as Move Kit. */
  return (
    <div className="products-modal-overlay proposal-folder-move-overlay" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="products-modal proposal-folder-move-modal" role="dialog" aria-modal="true" aria-label="Move Proposal">
        <header className="proposal-folder-move-heading">
          <span className="proposal-folder-move-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M8 14h9m-3-3 3 3-3 3"/></svg></span>
          <h2>Move Proposal</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close Move Proposal"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </header>
        <form onSubmit={submit} className="proposal-folder-move-form">
          <label className="proposal-folder-move-search">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search folders or paths..." aria-label="Search destination folders" autoComplete="off" />
          </label>
          <div className="proposal-folder-move-list" role="radiogroup" aria-label="Destination">
            {filtered.map((item) => (
              <button key={item.id || "root"} type="button" role="radio" aria-checked={selected === item.id}
                className={`proposal-folder-move-card${selected === item.id ? " is-selected" : ""}`}
                onClick={() => { setSelected(item.id); setError(""); }} disabled={busy}>
                <span className="proposal-folder-move-figure" aria-hidden="true"><i/><i/><i/></span>
                <span className="proposal-folder-move-copy"><strong>{item.name}</strong>
                  <small>{item.id ? `${item.count} proposal${item.count === 1 ? "" : "s"}` : "No folder"}</small>
                  <em>{item.parentPath || "Main Proposals"}</em></span>
                {selected === item.id ? <span className="proposal-folder-move-selected">✓</span> : null}
              </button>
            ))}
            {!filtered.length && <p className="proposal-folder-move-empty">No matching folders.</p>}
          </div>
          <div className="proposal-folder-move-destination"><span>Destination</span><strong>{destination?.path || "Main Proposals"}</strong></div>
          {error ? <div className="next-proposals-error products-form-error" role="alert">{error}</div> : null}
          <div className="products-modal__actions proposal-folder-move-actions">
            <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="products-btn products-btn--dark" disabled={busy || selected === currentId}>{busy ? "Moving…" : "Move Proposal"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

/* ERP_PROPOSALS_KITS_PARITY_V2: add a component to every selected proposal. */
export function BulkProposalEditModal({ count, products, busy, onClose, onSubmit }) {
  const [productId,setProductId]=useState("");
  const [quantity,setQuantity]=useState("1");
  const [error,setError]=useState("");
  const submit=async(event) => {
    event.preventDefault(); const n=Number(quantity);
    if (!productId || !Number.isInteger(n) || n<1) {setError("Choose a component and a positive whole quantity.");return;}
    setError("");
    try {await onSubmit(productId,n);} catch(cause){setError(cause?.message || "Failed to edit selected proposals.");}
  };
  return (
    <div className="products-modal-overlay proposal-folder-move-overlay" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)onClose();}} role="presentation">
      <section className="products-modal proposal-folder-move-modal proposal-bulk-edit-modal" role="dialog" aria-modal="true" aria-label="Edit selected proposals">
        <header className="proposal-folder-move-heading">
          <span className="proposal-folder-move-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg></span>
          <h2>Edit {count} Proposals</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </header>
        <form onSubmit={submit} className="proposal-bulk-edit-form">
          <label><span>Component *</span><select value={productId} onChange={(e)=>setProductId(e.target.value)} disabled={busy} required>
            <option value="">Select component</option>
            {(products||[]).map((p)=><option key={p.id} value={p.id}>{p.name}{p.displayId ? ` · ${p.displayId}` : ""}</option>)}
          </select></label>
          <label><span>Quantity to add *</span><input type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={(e)=>setQuantity(e.target.value)} disabled={busy}/></label>
          <p>The selected component and quantity will be added to all {count} proposals. Existing components stay unchanged; matching quantities increase.</p>
          {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
          <div className="products-modal__actions proposal-folder-move-actions">
            <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="products-btn products-btn--dark" disabled={busy || !productId}>{busy ? "Applying…" : `Apply to ${count} Proposals`}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
