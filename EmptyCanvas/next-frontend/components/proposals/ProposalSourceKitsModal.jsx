"use client";

import { useEffect, useMemo, useState } from "react";
import { collectSourceKits } from "../../lib/proposal-source-kit-management.mjs";

function SourceFolderIcon({ kind = "folder" }) {
  return <span className={`proposal-source-manager__folder-art is-${kind}`} aria-hidden="true"><span className="proposal-source-manager__folder-tab" /><span className="proposal-source-manager__folder-face" /></span>;
}

export default function ProposalSourceKitsModal({ items, kits, folders, editable, busy, onClose, onRemove }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const groups = useMemo(() => collectSourceKits(items, kits, folders), [items, kits, folders]);
  const kitCount = groups.reduce((sum, folder) => sum + folder.kits.length, 0);
  const visibleGroups = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return groups.map((folder) => ({ ...folder, kits: folder.kits.filter((kit) => !needle || `${kit.name} ${folder.name}`.toLowerCase().includes(needle)) })).filter((folder) => folder.kits.length);
  }, [groups, query]);

  useEffect(() => {
    const handleKey = (event) => { if (event.key === "Escape" && !busy && !document.body.classList.contains("ops-next-confirm-open")) onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [busy, onClose]);

  return (
    <div className="proposal-source-manager__overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="proposal-source-manager" role="dialog" aria-modal="true" aria-label="Manage Source Kits">
        <header className="proposal-source-manager__header">
          <div className="proposal-source-manager__emblem"><SourceFolderIcon /></div>
          <div className="proposal-source-manager__header-copy"><h2>Manage Kits</h2><p>Source kits included in this proposal</p></div>
          <button type="button" className="proposal-source-manager__close" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
        </header>
        <div className="proposal-source-manager__scroll">
          <div className="proposal-source-manager__summary"><strong>{kitCount} source kit{kitCount === 1 ? "" : "s"}</strong><span>Remove a whole kit without changing the other kits or your original Kits library.</span></div>
          <label className="proposal-source-manager__search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search source kits or folders…" /></label>
          {!editable ? <div className="proposal-source-manager__hint">Open the proposal in <strong>Edit</strong> mode to remove source kits.</div> : null}
          {visibleGroups.map((folder) => {
            const isOpen = expanded.has(folder.id) || Boolean(query);
            return <div className="proposal-source-manager__group" key={folder.id}>
              <button type="button" className="proposal-source-manager__folder" aria-expanded={isOpen} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next; })}>
                <SourceFolderIcon /><span className="proposal-source-manager__folder-name"><strong>{folder.name}</strong><small>Kit folder</small></span><span className="proposal-source-manager__count">{folder.kits.length} kits</span><span className="proposal-source-manager__chevron">{isOpen ? "⌃" : "⌄"}</span>
              </button>
              {isOpen ? <div className="proposal-source-manager__kit-grid">
                {folder.kits.map((kit) => <article className="proposal-source-manager__kit" key={kit.id}>
                  <div className="proposal-source-manager__kit-top"><SourceFolderIcon kind="kit" /><div><strong title={kit.name}>{kit.name}</strong><small>{kit.components} component{kit.components === 1 ? "" : "s"} · Qty {kit.totalQuantity.toLocaleString("en-EG")}</small></div></div>
                  {editable ? <button className="proposal-source-manager__remove" type="button" disabled={busy || !kit.canRemove} title={kit.issue || "Remove this kit from the proposal"} onClick={() => onRemove(kit)}><span aria-hidden="true">×</span> Remove kit</button> : null}
                  {kit.issue ? <p className="proposal-source-manager__issue">{kit.issue}</p> : null}
                </article>)}
              </div> : null}
            </div>;
          })}
          {!visibleGroups.length ? <div className="proposal-source-manager__empty">{query ? "No source kits match your search." : "No kits are recorded as sources. Direct components are not affected."}</div> : null}
        </div>
        <footer className="proposal-source-manager__footer"><button type="button" onClick={onClose} disabled={busy}>Done</button></footer>
      </section>
    </div>
  );
}
