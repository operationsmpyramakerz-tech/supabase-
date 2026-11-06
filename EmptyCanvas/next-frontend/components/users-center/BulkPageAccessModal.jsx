"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { requestJson, usersCenterMutation } from "./usersCenterClientShared";
import { FEATURE_DEFINITIONS, ACTIVE_PILOT_FEATURE_KEYS } from "../../lib/feature-permissions-registry";

const LEVELS = [
  { value: "keep", label: "Keep unchanged" },
  { value: "view", label: "Allow · View" },
  { value: "edit", label: "Allow · Edit" },
  { value: "admin", label: "Allow · Admin" },
  { value: "revoke", label: "Revoke access" },
];
function text(v) { return String(v ?? "").trim(); }

/** A selective patch editor; never copy one person's entire access matrix to others. */
export default function BulkPageAccessModal({ members, allowPages = true, allowFeatures = false, protect, onClose, onComplete }) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState(allowPages ? "pages" : "features");
  const [featureChoices, setFeatureChoices] = useState({});
  const [pages, setPages] = useState([]);
  const [choices, setChoices] = useState({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const ids = useMemo(() => members.map((member) => text(member.id)).filter(Boolean), [members]);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let alive = true;
    if (!allowPages) { setLoading(false); return undefined; }
    requestJson(`/next/api/users-center/pages?_=${Date.now()}`)
      .then((data) => { if (alive) setPages(data.pages || []); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [allowPages]);
  const changes = useMemo(() => pages.map((page) => {
    const pageId = text(page.pageId || page.id);
    const choice = choices[pageId] || "keep";
    if (choice === "keep") return null;
    return { pageId, isEnabled: choice !== "revoke", accessLevel: choice === "revoke" ? "view" : choice };
  }).filter(Boolean), [pages, choices]);
  const featureItems = useMemo(() => FEATURE_DEFINITIONS.filter((item) => ACTIVE_PILOT_FEATURE_KEYS.includes(item.key)), []);
  const featureChanges = useMemo(() => featureItems.filter((item) => (featureChoices[item.key] || "keep") !== "keep").map((item) => ({ key: item.key, allowed: featureChoices[item.key] === "allow" })), [featureChoices, featureItems]);
  const activeChanges = mode === "features" ? featureChanges : changes;
  const shown = (mode === "features" ? featureItems : pages).filter((page) => text(`${page.pageName || page.label} ${page.moduleName || page.module} ${page.key || ""}`).toLowerCase().includes(query.toLowerCase()));
  const canApply = ids.length > 0 && activeChanges.length > 0 && !saving && (!loading || mode === "features");
  function updateChoice(id, value) { setChoices((current) => ({ ...current, [id]: value })); setReview(false); setResult(null); setError(""); }
  async function apply() {
    if (!canApply) return;
    await protect({ title: "Bulk access", message: `Change ${activeChanges.length} ${mode === "features" ? "feature" : "page"} permissions for ${ids.length} accounts?` }, async () => {
      setSaving(true); setError(""); setResult(null);
      try {
        const body = await usersCenterMutation(mode === "features" ? "feature-access-bulk" : "page-access-bulk", { memberIds: ids, changes: activeChanges });
        setResult({ successes: body.successes || [], failures: body.failures || [] });
        await onComplete?.(body);
        if (!(body.failures || []).length) onClose();
      } catch (err) { setError(err.message || "Unable to update access."); }
      finally { setSaving(false); }
    });
  }
  return mounted ? createPortal(<div className="ua-bulk-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
    <section className="ua-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="ua-bulk-title">
      <div className="ua-bulk-modal__header">
        <div><span className="ua-bulk-modal__eyebrow">USERS CENTER · BULK ACTION</span><h2 id="ua-bulk-title">Edit Access</h2><p>{ids.length} selected users · Set only the permissions you want to change.</p></div>
        <button type="button" className="ua-bulk-modal__close" onClick={onClose} disabled={saving} aria-label="Close bulk editor">×</button>
      </div>
      <div className="ua-bulk-modal__modes">{allowPages ? <button type="button" className={mode === "pages" ? "is-active" : ""} onClick={() => { setMode("pages"); setQuery(""); setReview(false); setResult(null); }}>Page Access</button> : null}{allowFeatures ? <button type="button" className={mode === "features" ? "is-active" : ""} onClick={() => { setMode("features"); setQuery(""); setReview(false); setResult(null); }}>Advanced Features</button> : null}</div>
      <div className="ua-bulk-modal__notice"><strong>Keep unchanged is the default.</strong> {mode === "pages" ? "Only selected pages are updated; all other page and feature permissions are preserved." : "Only the selected feature rules are changed, keeping existing scopes and other rules. Only users with an already enabled Advanced Permissions profile can be updated; legacy profiles will be reported as skipped/failed."}</div>
      <div className="ua-bulk-modal__body">
        {!review ? <>
          <input className="ua-bulk-modal__search" type="search" placeholder="Search pages or modules..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search pages"/>
          {loading ? <div className="ua-bulk-modal__empty">Loading available pages...</div> : null}
          {mode === "pages" ? shown.map((page) => { const id = text(page.pageId || page.id); return <label className={`ua-bulk-page${(choices[id] || "keep") !== "keep" ? " is-changed" : ""}`} key={id}><span><strong>{page.pageName}</strong><small>{page.moduleName || "General"}</small></span><select value={choices[id] || "keep"} onChange={(event) => updateChoice(id, event.target.value)} aria-label={`Update ${page.pageName}`}>{LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}</select></label>; }) : shown.map((feature) => <label className={`ua-bulk-page${(featureChoices[feature.key] || "keep") !== "keep" ? " is-changed" : ""}`} key={feature.key}><span><strong>{feature.label}</strong><small>{feature.module} · {feature.key}</small></span><select value={featureChoices[feature.key] || "keep"} onChange={(event) => {setFeatureChoices((current) => ({ ...current, [feature.key]: event.target.value })); setReview(false); setResult(null);setError("");}} aria-label={`Update ${feature.label}`}><option value="keep">Keep unchanged</option><option value="allow">Allow</option><option value="deny">Deny</option></select></label>)}
          {!loading && !shown.length ? <div className="ua-bulk-modal__empty">No matching pages</div> : null}
        </> : <div className="ua-bulk-review"><h3>Review before applying</h3><p>These {activeChanges.length} {mode === "features" ? "feature" : "page"} changes will be applied to {ids.length} selected accounts. Other permissions remain unchanged.</p><ul>{mode === "features" ? activeChanges.map((change) => { const feature = featureItems.find((item) => item.key === change.key);return <li key={change.key}><strong>{feature?.label || change.key}</strong><span>{change.allowed ? "Allow" : "Deny"}</span></li>;}) : activeChanges.map((change) => { const page = pages.find((row) => text(row.pageId || row.id) === change.pageId); return <li key={change.pageId}><strong>{page?.pageName || "Page"}</strong><span>{change.isEnabled ? `Allow ${change.accessLevel}` : "Revoke"}</span></li>; })}</ul></div>}
        {error ? <p className="ua-bulk-modal__error" role="alert">{error}</p> : null}
        {result ? <div className="ua-bulk-modal__notice" role="status"><strong>{result.successes.length} updated, {result.failures.length} failed.</strong>{result.failures.length ? <p>{result.failures.map((row) => `${row.id}: ${row.error}`).join("; ")}</p> : null}</div> : null}
      </div>
      <div className="ua-bulk-modal__footer"><button type="button" className="ua-bulk-button ua-bulk-button--light" disabled={saving} onClick={() => review ? setReview(false) : onClose()}>{review ? "Back to edit" : "Cancel"}</button><button type="button" className="ua-bulk-button ua-bulk-button--primary" disabled={!canApply} onClick={() => review ? apply() : setReview(true)}>{saving ? "Saving…" : review ? `Apply to ${ids.length} Users` : `Review ${activeChanges.length} Changes`}</button></div>
    </section>
  </div>, document.body) : null;
}
