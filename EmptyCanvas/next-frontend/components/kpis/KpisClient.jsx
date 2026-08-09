"use client";

import { useEffect, useMemo, useState } from "react";

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function rank(level) { return ({ view: 1, edit: 2, admin: 3 })[lower(level)] || 0; }
function monthKey(value) { const match = text(value).match(/^(\d{4})-(\d{2})/); return match ? `${match[1]}-${match[2]}` : ""; }
function currentMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function fmtMonth(value) {
  const key = monthKey(value);
  if (!key) return "—";
  const date = new Date(`${key}-01T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value) || "—";
  return date.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}
function percent(value) { return `${Math.max(0, Math.min(100, number(value))).toFixed(1)}%`; }
function scorePercent(actual, weight) { const w = number(weight); return w > 0 ? Math.max(0, Math.min(100, (number(actual) / w) * 100)) : 0; }
function unique(values) { return [...new Set((values || []).map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function makeId(prefix = "id") { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session has expired.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(text(body?.message || body?.error) || "The request failed.");
  return body;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-toast next-toast--${toast.type || "info"}`} role="status">
      <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}</span>
      <div><strong>{toast.title || "KPIs"}</strong><small>{toast.message}</small></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Modal({ title, eyebrow, wide = false, onClose, children, footer }) {
  return (
    <div className="next-kpi-modal-layer" role="presentation">
      <button className="next-kpi-modal-backdrop" type="button" onClick={onClose} aria-label="Close modal" />
      <section className={`next-kpi-modal ${wide ? "next-kpi-modal--wide" : ""}`} role="dialog" aria-modal="true">
        <header><div><small>{eyebrow}</small><h3>{title}</h3></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <div className="next-kpi-modal-body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}

function PromptPassword({ title, message, onClose, onSubmit }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (!text(password)) return setError("Admin password is required.");
    setBusy(true); setError("");
    try {
      await requestJson("/api/kpis/admin/verify", { method: "POST", body: JSON.stringify({ password }) });
      onSubmit(password);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} eyebrow="Protected KPI action" onClose={onClose} footer={null}>
      <form className="next-kpi-password-form" onSubmit={submit}>
        <p>{message}</p>
        <label>Admin password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label>
        {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
        <div className="next-kpi-form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Verifying..." : "Continue"}</button></div>
      </form>
    </Modal>
  );
}

function ScoreRing({ score, label, month }) {
  const safe = Math.max(0, Math.min(100, number(score)));
  return (
    <article className="next-kpi-score-card">
      <small>Current score</small>
      <div className="next-kpi-score-ring" style={{ "--score": safe }}><strong>{Number.isFinite(Number(score)) ? `${safe.toFixed(1)}%` : "—"}<span>Final</span></strong></div>
      <h3>{label || "No review selected"}</h3><p>{month ? fmtMonth(month) : "—"}</p>
    </article>
  );
}

function Graph({ points, selectedMonth, onSelect }) {
  const months = useMemo(() => {
    const now = new Date();
    const items = [];
    for (let index = 11; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const point = (points || []).find((row) => monthKey(row.reviewMonth) === key);
      items.push({ key, label: date.toLocaleDateString("en-US", { month: "short" }), point, value: number(point?.finalPercentage) });
    }
    return items;
  }, [points]);
  return (
    <div className="next-kpi-chart" aria-label="Monthly KPI chart">
      <div className="next-kpi-chart-scale"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
      <div className="next-kpi-chart-bars">
        {months.map((item) => (
          <button type="button" key={item.key} className={selectedMonth === item.key ? "active" : ""} onClick={() => onSelect(item.key)} title={`${fmtMonth(item.key)}: ${item.point ? percent(item.value) : "No review"}`}>
            <span className="next-kpi-chart-value">{item.point ? `${Math.round(item.value)}%` : ""}</span>
            <i><b style={{ height: `${item.point ? Math.max(4, item.value) : 3}%` }} /></i>
            <em>{item.label}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function StandardDetail({ standardId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { requestJson(`/api/kpis/standards?id=${encodeURIComponent(standardId)}`).then(setData).catch((err) => setError(err.message)); }, [standardId]);
  const standard = data?.standards?.[0];
  return (
    <Modal title={standard?.title || "KPI standard"} eyebrow="Standard details" wide onClose={onClose}>
      {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
      {!data && !error ? <div className="next-kpi-modal-loading">Loading standard...</div> : null}
      {standard ? (
        <div className="next-kpi-standard-detail">
          <div className="next-kpi-detail-grid"><div><span>Department</span><strong>{standard.department || "—"}</strong></div><div><span>Position</span><strong>{standard.rolePosition || "—"}</strong></div><div><span>Created</span><strong>{fmtDate(standard.createdAt)}</strong></div><div><span>Total weight</span><strong>{number(data.items?.reduce((sum, item) => sum + number(item.weightPercent), 0)).toFixed(1)}</strong></div></div>
          {standard.description ? <p className="next-kpi-standard-description">{standard.description}</p> : null}
          <div className="next-kpi-section-list">{(data.sections || []).map((section) => <article key={`${section.sectionOrder}-${section.section}`}><header><span>{section.sectionOrder}</span><div><h4>{section.section}</h4><p>{section.sectionDescription || "No section description"}</p></div><b>{number(section.weightPercent).toFixed(1)}</b></header><div>{(section.items || []).map((item) => <div className="next-kpi-standard-item" key={item.id}><span>{item.subsectionOrder}</span><div><strong>{item.subsection}</strong><small>{item.subsectionDescription || "—"}</small></div><b>{number(item.weightPercent).toFixed(1)}</b></div>)}</div></article>)}</div>
          {(data.evaluations || []).length ? <div className="next-kpi-evaluation-list"><h4>Overall evaluations</h4>{data.evaluations.map((row) => <div key={row.id || row.evaluationOrder}><span>{number(row.scoreFromPercentage).toFixed(0)}–{number(row.scoreToPercentage).toFixed(0)}%</span><strong>{row.grade}</strong></div>)}</div> : null}
        </div>
      ) : null}
    </Modal>
  );
}

function newSection() { return { id: makeId("section"), title: "", description: "", items: [{ id: makeId("item"), title: "", description: "", weight: "" }] }; }
function newEvaluation() { return { id: makeId("eval"), from: "", to: "", grade: "" }; }

function StandardForm({ meta, adminPassword, onClose, onSaved }) {
  const [form, setForm] = useState({ department: "", rolePosition: "", title: "", description: "" });
  const [sections, setSections] = useState([newSection()]);
  const [evaluations, setEvaluations] = useState([newEvaluation()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const positions = unique(meta.positionsByDepartment?.[lower(form.department)] || meta.users?.filter((u) => lower(u.department) === lower(form.department)).map((u) => u.position) || []);
  const totalWeight = sections.flatMap((section) => section.items).reduce((sum, item) => sum + Math.max(0, number(item.weight)), 0);
  const updateSection = (id, patch) => setSections((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  const updateItem = (sectionId, itemId, patch) => setSections((rows) => rows.map((row) => row.id === sectionId ? { ...row, items: row.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) } : row));
  const removeItem = (sectionId, itemId) => setSections((rows) => rows.map((row) => row.id === sectionId ? { ...row, items: row.items.filter((item) => item.id !== itemId) } : row));
  const submit = async (event) => {
    event.preventDefault(); setError("");
    const items = sections.flatMap((section, sectionIndex) => section.items.map((item, itemIndex) => ({ sectionOrder: sectionIndex + 1, section: text(section.title) || `Section ${sectionIndex + 1}`, sectionDescription: text(section.description), subsectionOrder: itemIndex + 1, subsection: text(item.title), subsectionDescription: text(item.description), weightPercent: number(item.weight) }))).filter((item) => item.subsection);
    if (!text(form.department) || !text(form.rolePosition)) return setError("Department and position are required.");
    if (!items.length) return setError("Add at least one KPI subsection.");
    setBusy(true);
    try {
      const body = await requestJson("/api/kpis/standards", { method: "POST", body: JSON.stringify({ ...form, items, evaluations: evaluations.map((row, index) => ({ evaluationOrder: index + 1, scoreFromPercentage: number(row.from), scoreToPercentage: row.to === "" ? 100 : number(row.to), grade: text(row.grade) })).filter((row) => row.grade), adminPassword }) });
      onSaved(body);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Create KPI standard" eyebrow="Department and role scorecard" wide onClose={onClose} footer={null}>
      <form className="next-kpi-builder" onSubmit={submit}>
        <div className="next-kpi-form-grid"><label>Department<select value={form.department} onChange={(e) => setForm((current) => ({ ...current, department: e.target.value, rolePosition: "" }))}><option value="">Choose department</option>{(meta.departments || []).map((value) => <option key={value}>{value}</option>)}</select></label><label>Role / Position<select value={form.rolePosition} onChange={(e) => setForm((current) => ({ ...current, rolePosition: e.target.value }))} disabled={!form.department}><option value="">Choose position</option>{positions.map((value) => <option key={value}>{value}</option>)}</select></label><label>Standard title<input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} placeholder="Example: R&D Engineer KPIs" /></label><label className="full">Description<textarea rows="2" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></label></div>
        <div className="next-kpi-builder-heading"><div><small>KPI sections</small><h4>Define weighted subsections</h4></div><button type="button" className="secondary-button" onClick={() => setSections((rows) => [...rows, newSection()])}>+ Add section</button></div>
        <div className="next-kpi-builder-sections">{sections.map((section, sectionIndex) => <article key={section.id}><header><span>{sectionIndex + 1}</span><div><input value={section.title} onChange={(e) => updateSection(section.id, { title: e.target.value })} placeholder={`Section ${sectionIndex + 1} title`} /><textarea rows="1" value={section.description} onChange={(e) => updateSection(section.id, { description: e.target.value })} placeholder="Section description" /></div><button type="button" onClick={() => setSections((rows) => rows.filter((row) => row.id !== section.id))}>×</button></header><div className="next-kpi-builder-items">{section.items.map((item, itemIndex) => <div key={item.id}><span>{itemIndex + 1}</span><input value={item.title} onChange={(e) => updateItem(section.id, item.id, { title: e.target.value })} placeholder="Subsection title" /><input type="number" min="0" step="0.01" value={item.weight} onChange={(e) => updateItem(section.id, item.id, { weight: e.target.value })} placeholder="Weight" /><textarea value={item.description} onChange={(e) => updateItem(section.id, item.id, { description: e.target.value })} placeholder="Subsection description" /><button type="button" onClick={() => removeItem(section.id, item.id)}>×</button></div>)}</div><footer><button type="button" onClick={() => updateSection(section.id, { items: [...section.items, { id: makeId("item"), title: "", description: "", weight: "" }] })}>+ Add subsection</button></footer></article>)}</div>
        <div className={`next-kpi-weight-total ${Math.abs(totalWeight - 100) < 0.01 ? "complete" : totalWeight > 100 ? "over" : ""}`}><span>Total weight</span><strong>{totalWeight.toFixed(1)}</strong></div>
        <div className="next-kpi-builder-heading"><div><small>Overall evaluation</small><h4>Map score ranges to grades</h4></div><button type="button" className="secondary-button" onClick={() => setEvaluations((rows) => [...rows, newEvaluation()])}>+ Add evaluation</button></div>
        <div className="next-kpi-evaluation-editor">{evaluations.map((row, index) => <div key={row.id}><span>{index + 1}</span><label>From<input type="number" min="0" max="100" value={row.from} onChange={(e) => setEvaluations((rows) => rows.map((item) => item.id === row.id ? { ...item, from: e.target.value } : item))} /></label><label>To<input type="number" min="0" max="100" value={row.to} onChange={(e) => setEvaluations((rows) => rows.map((item) => item.id === row.id ? { ...item, to: e.target.value } : item))} /></label><label>Grade<input value={row.grade} onChange={(e) => setEvaluations((rows) => rows.map((item) => item.id === row.id ? { ...item, grade: e.target.value } : item))} placeholder="Excellent" /></label><button type="button" onClick={() => setEvaluations((rows) => rows.filter((item) => item.id !== row.id))}>×</button></div>)}</div>
        {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
        <div className="next-kpi-form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving..." : "Save standard"}</button></div>
      </form>
    </Modal>
  );
}

function ReviewCreate({ meta, adminPassword, onClose, onCreated }) {
  const [form, setForm] = useState({ teamMemberId: "", standardId: "", reviewMonth: currentMonth() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedUser = (meta.users || []).find((u) => text(u.id) === text(form.teamMemberId));
  const standards = (meta.standards || []).filter((standard) => !selectedUser || (lower(standard.department) === lower(selectedUser.department) && lower(standard.rolePosition) === lower(selectedUser.position)));
  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (!form.teamMemberId || !form.standardId || !form.reviewMonth) return setError("Employee, KPI standard, and month are required.");
    setBusy(true);
    try {
      const body = await requestJson("/api/kpis/reviews", { method: "POST", body: JSON.stringify({ teamMemberId: form.teamMemberId, teamMemberName: selectedUser?.name || "", standardId: form.standardId, reviewMonth: `${form.reviewMonth}-01`, adminPassword }) });
      onCreated(body.reviewId, adminPassword);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Create monthly review" eyebrow="Employee KPI review" onClose={onClose} footer={null}>
      <form className="next-kpi-simple-form" onSubmit={submit}>
        <label>Employee<select value={form.teamMemberId} onChange={(e) => setForm((current) => ({ ...current, teamMemberId: e.target.value, standardId: "" }))}><option value="">Choose employee</option>{(meta.users || []).map((user) => <option value={user.id} key={user.id}>{user.name} — {user.department || "No department"} / {user.position || "No position"}</option>)}</select></label>
        <label>KPI standard<select value={form.standardId} onChange={(e) => setForm((current) => ({ ...current, standardId: e.target.value }))}><option value="">Choose KPI standard</option>{standards.map((standard) => <option value={standard.id} key={standard.id}>{standard.title}</option>)}</select></label>
        <label>Review month<input type="month" value={form.reviewMonth} onChange={(e) => setForm((current) => ({ ...current, reviewMonth: e.target.value }))} /></label>
        {selectedUser && !standards.length ? <div className="next-inline-warning">No visible KPI standard matches this employee's department and position.</div> : null}
        {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
        <div className="next-kpi-form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Opening..." : "Create and open"}</button></div>
      </form>
    </Modal>
  );
}

async function fileToDataUrl(file) { return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("The evidence file could not be read.")); reader.readAsDataURL(file); }); }
async function directUpload(file) {
  const fallback = async () => {
    const dataUrl = await fileToDataUrl(file);
    const body = await requestJson("/api/kpis/evidence-upload", { method: "POST", body: JSON.stringify({ filename: file.name, mime: file.type, size: file.size, dataUrl }) });
    return body.file;
  };
  try {
    const ticket = await requestJson("/api/storage/upload-ticket", { method: "POST", body: JSON.stringify({ scope: "kpi-evidence", filename: file.name, mime: file.type || "application/octet-stream", size: file.size }) });
    if (!ticket?.upload?.signedUrl || !ticket?.uploadRef) return await fallback();
    const upload = await fetch(ticket.upload.signedUrl, { method: ticket.upload.method || "PUT", headers: ticket.upload.headers || {}, body: file });
    if (!upload.ok) throw new Error("Direct storage upload failed.");
    const complete = await requestJson("/api/storage/upload-complete", { method: "POST", body: JSON.stringify({ uploadRef: ticket.uploadRef }) });
    return complete.file;
  } catch (error) {
    if (file.size <= 4 * 1024 * 1024) return await fallback();
    throw error;
  }
}

function ReviewDetail({ reviewId, editable, adminPassword = "", onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [scores, setScores] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState("");
  useEffect(() => { const query = adminPassword ? `?adminPassword=${encodeURIComponent(adminPassword)}` : ""; requestJson(`/api/kpis/reviews/${encodeURIComponent(reviewId)}${query}`).then((body) => { setData(body); setScores((body.details || []).map((item) => ({ ...item }))); }).catch((err) => setError(err.message)); }, [reviewId, adminPassword]);
  const grouped = useMemo(() => { const map = new Map(); for (const item of scores) { const key = `${item.sectionOrder}-${item.section}`; if (!map.has(key)) map.set(key, { section: item.section, description: item.sectionDescription, items: [] }); map.get(key).items.push(item); } return [...map.values()]; }, [scores]);
  const update = (scoreId, patch) => setScores((rows) => rows.map((row) => row.scoreId === scoreId ? { ...row, ...patch } : row));
  const upload = async (scoreId, file) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return setError("Evidence file must be 15 MB or smaller.");
    setUploading(scoreId); setError("");
    try { const saved = await directUpload(file); update(scoreId, { evidenceText: saved?.url || "" }); } catch (err) { setError(err.message); } finally { setUploading(""); }
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      const body = await requestJson(`/api/kpis/reviews/${encodeURIComponent(reviewId)}/scores`, { method: "PATCH", body: JSON.stringify({ adminPassword, scores: scores.map((item) => ({ scoreId: item.scoreId, actualPercent: item.actualPercent === "" ? null : item.actualPercent, evidenceText: item.evidenceText, managerNotes: item.managerNotes })) }) });
      setData(body); setScores((body.details || []).map((item) => ({ ...item }))); onSaved(body.summary);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const summary = data?.summary;
  return (
    <Modal title={summary?.teamMemberName || "KPI review"} eyebrow={summary ? `${fmtMonth(summary.reviewMonth)} review` : "Loading review"} wide onClose={onClose} footer={editable && data ? <><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="button" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save scores"}</button></> : null}>
      {error ? <div className="next-inline-warning next-inline-warning--error">{error}</div> : null}
      {!data && !error ? <div className="next-kpi-modal-loading">Loading review...</div> : null}
      {summary ? <div className="next-kpi-review-detail"><div className="next-kpi-detail-grid"><div><span>Employee</span><strong>{summary.teamMemberName || "—"}</strong></div><div><span>Department</span><strong>{summary.department || "—"}</strong></div><div><span>Position</span><strong>{summary.rolePosition || "—"}</strong></div><div><span>Month</span><strong>{fmtMonth(summary.reviewMonth)}</strong></div><div><span>Score</span><strong>{percent(summary.finalPercentage)}</strong></div><div><span>Rating</span><strong>{summary.performanceRating || "—"}</strong></div><div><span>Created by</span><strong>{summary.createdByName || "—"}</strong></div><div><span>Status</span><strong>{summary.status || "draft"}</strong></div></div>
        <div className="next-kpi-score-sections">{grouped.map((section, sectionIndex) => <article key={`${section.section}-${sectionIndex}`}><header><span>{sectionIndex + 1}</span><div><h4>{section.section || "Section"}</h4><p>{section.description || ""}</p></div></header><div>{section.items.map((item) => <section key={item.scoreId}><div className="next-kpi-score-title"><span>{item.subsectionOrder}</span><div><strong>{item.subsection || "KPI subsection"}</strong><small>{item.subsectionDescription || "—"}</small></div><b>{number(item.weightPercent).toFixed(1)}</b></div>{editable ? <><div className="next-kpi-score-inputs"><label>Score<input type="number" min="0" max={number(item.weightPercent)} step="0.01" value={item.actualPercent ?? ""} onChange={(e) => update(item.scoreId, { actualPercent: e.target.value })} /></label><div><span>KPI %</span><strong>{scorePercent(item.actualPercent, item.weightPercent).toFixed(1)}%</strong></div></div><div className="next-kpi-score-notes"><label>Evidence<input type="file" onChange={(e) => upload(item.scoreId, e.target.files?.[0])} disabled={uploading === item.scoreId} /><small>{uploading === item.scoreId ? "Uploading..." : item.evidenceText ? <a href={item.evidenceText} target="_blank" rel="noreferrer">Open evidence</a> : "No evidence uploaded"}</small></label><label>Manager notes<textarea rows="2" value={item.managerNotes || ""} onChange={(e) => update(item.scoreId, { managerNotes: e.target.value })} /></label></div></> : <div className="next-kpi-score-readonly"><div><span>Score</span><strong>{item.actualPercent === null ? "—" : number(item.actualPercent).toFixed(1)}</strong></div><div><span>KPI %</span><strong>{scorePercent(item.actualPercent, item.weightPercent).toFixed(1)}%</strong></div><div><span>Evidence</span>{item.evidenceText ? <a href={item.evidenceText} target="_blank" rel="noreferrer">Open file</a> : <strong>—</strong>}</div><div><span>Manager notes</span><p>{item.managerNotes || "—"}</p></div></div>}</section>)}</div></article>)}</div>
      </div> : null}
    </Modal>
  );
}

export default function KpisClient({ initialMeta, initialReviews, initialGraph, bootstrapWarnings = [] }) {
  const [meta, setMeta] = useState(initialMeta || {});
  const [reviews, setReviews] = useState(Array.isArray(initialReviews?.reviews) ? initialReviews.reviews : []);
  const [graphPoints, setGraphPoints] = useState(Array.isArray(initialGraph?.points) ? initialGraph.points : []);
  const [graphUserId, setGraphUserId] = useState(text(initialMeta?.currentUser?.id));
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [reviewTab, setReviewTab] = useState("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ department: "", position: "", standardId: "", month: "" });
  const [standardFilters, setStandardFilters] = useState({ department: "", position: "" });
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const accessLevel = lower(meta.accessLevel || meta.currentUser?.accessLevel || "view");
  const currentUser = meta.currentUser || {};
  const graphUser = (meta.users || []).find((u) => text(u.id) === graphUserId) || currentUser;
  const selectedPoint = graphPoints.find((row) => monthKey(row.reviewMonth) === selectedMonth) || graphPoints[graphPoints.length - 1] || null;

  const showToast = (message, type = "info", title = "KPIs") => setToast({ message, type, title });
  const refreshMeta = async () => { const body = await requestJson("/api/kpis/meta"); setMeta(body); return body; };
  const buildQuery = ({ nextFilters = filters, nextTab = reviewTab } = {}) => {
    const query = new URLSearchParams();
    if (nextFilters.department) query.set("department", nextFilters.department);
    if (nextFilters.position) query.set("rolePosition", nextFilters.position);
    if (nextFilters.standardId) query.set("standardId", nextFilters.standardId);
    if (nextFilters.month) { query.set("from", `${nextFilters.month}-01`); query.set("to", `${nextFilters.month}-01`); }
    if (nextTab === "mine" && currentUser.id) query.set("teamMemberId", currentUser.id);
    if (nextTab === "created" && currentUser.id) query.set("createdByTeamMemberId", currentUser.id);
    return query;
  };
  const refreshReviews = async (options = {}) => { const query = buildQuery(options); const body = await requestJson(`/api/kpis/reviews${query.toString() ? `?${query}` : ""}`); setReviews(body.reviews || []); return body; };
  const refreshGraph = async (userId = graphUserId) => { const body = await requestJson(`/api/kpis/graph${userId ? `?teamMemberId=${encodeURIComponent(userId)}` : ""}`); setGraphPoints(body.points || []); setSelectedMonth(currentMonth()); return body; };
  const refreshAll = async () => { setBusy(true); try { await Promise.all([refreshMeta(), refreshReviews(), refreshGraph()]); showToast("KPI data refreshed.", "success"); } catch (err) { showToast(err.message, "error"); } finally { setBusy(false); } };

  const visibleReviews = useMemo(() => {
    const needle = lower(search);
    return reviews.filter((review) => !needle || [review.teamMemberName, review.department, review.rolePosition, review.standardTitle, review.performanceRating, review.status].some((value) => lower(value).includes(needle)));
  }, [reviews, search]);
  const visibleStandards = useMemo(() => (meta.standards || []).filter((standard) => (!standardFilters.department || lower(standard.department) === lower(standardFilters.department)) && (!standardFilters.position || lower(standard.rolePosition) === lower(standardFilters.position))), [meta.standards, standardFilters]);
  const reviewStats = useMemo(() => ({ total: reviews.length, reviewed: reviews.filter((r) => number(r.completedItemCount) > 0).length, avg: reviews.length ? reviews.reduce((sum, r) => sum + number(r.finalPercentage), 0) / reviews.length : 0, standards: (meta.standards || []).length }), [reviews, meta.standards]);

  const askPassword = (kind) => setModal({ type: "password", kind });
  const beginStandard = () => rank(accessLevel) >= rank("admin") ? setModal({ type: "standard", password: "" }) : askPassword("standard");
  const beginReview = () => rank(accessLevel) >= rank("edit") ? setModal({ type: "create-review", password: "" }) : askPassword("review");
  const passwordAccepted = (password) => setModal((current) => ({ type: current.kind === "standard" ? "standard" : "create-review", password }));
  const onStandardSaved = async (body) => { setModal(null); await refreshMeta(); showToast(body.duplicateFound ? "KPI standard saved. Another standard already exists for the same department and position." : "KPI standard saved.", body.duplicateFound ? "info" : "success"); };
  const onReviewCreated = async (reviewId, adminPassword = "") => { setModal({ type: "review", reviewId, editable: true, adminPassword }); await Promise.all([refreshReviews(), refreshGraph()]); showToast("KPI review created.", "success"); };
  const onReviewSaved = async () => { await Promise.all([refreshReviews(), refreshGraph()]); showToast("KPI scores saved.", "success"); };
  const openReview = (review, editable = false) => setModal({ type: "review", reviewId: review.reviewId, editable });
  const downloadReport = () => { const query = buildQuery(); if (reviewTab !== "all") query.set("tab", reviewTab); window.open(`/api/kpis/reviews/report.pdf${query.toString() ? `?${query}` : ""}`, "_blank", "noopener"); };

  return (
    <section className="next-kpis-page">
      <Toast toast={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? <div className="next-inline-warning">Some KPI resources were delayed during initial loading. Refresh can retry them.</div> : null}
      <section className="next-kpis-hero"><div><span className="pill">Performance management</span><h2>Monthly employee scorecards, standards, and evidence in one workspace.</h2><p>Create role-based KPI standards, open monthly reviews, monitor performance trends, and export filtered reports while keeping the classic interface available.</p><div className="next-kpis-hero-actions"><button className="primary-button" type="button" onClick={beginReview}>Create review</button><button className="secondary-button" type="button" onClick={beginStandard}>Create KPI standard</button><button className="secondary-button" type="button" onClick={refreshAll} disabled={busy}>{busy ? "Refreshing..." : "Refresh"}</button><a className="secondary-button" href="/kpis?classic=1">Classic KPIs</a></div></div><div className="next-kpis-hero-stats"><article><small>Visible reviews</small><strong>{reviewStats.total}</strong><span>{reviewStats.reviewed} with scores</span></article><article><small>Average score</small><strong>{percent(reviewStats.avg)}</strong><span>Current filtered set</span></article><article><small>Standards</small><strong>{reviewStats.standards}</strong><span>Visible to your access</span></article><article><small>Access level</small><strong>{accessLevel || "view"}</strong><span>{currentUser.department || "No department"}</span></article></div></section>

      <section className="next-kpis-overview"><article className="next-kpi-graph-card"><header><div><small>Employee monthly KPIs</small><h3>{graphUser?.name ? `${graphUser.name} KPI graph` : "Current user KPI graph"}</h3></div><label>Employee<select value={graphUserId} onChange={async (e) => { const value = e.target.value; setGraphUserId(value); try { await refreshGraph(value); } catch (err) { showToast(err.message, "error"); } }}><option value={currentUser.id || ""}>{currentUser.name || "Current user"}</option>{rank(accessLevel) >= 2 ? (meta.users || []).filter((u) => u.id !== currentUser.id).map((user) => <option key={user.id} value={user.id}>{user.name}</option>) : null}</select></label></header><Graph points={graphPoints} selectedMonth={selectedMonth} onSelect={setSelectedMonth} /></article><ScoreRing score={selectedPoint?.finalPercentage} label={selectedPoint?.performanceRating} month={selectedPoint?.reviewMonth} /></section>

      <section className="next-kpis-workspace"><article className="next-kpi-panel next-kpi-panel--reviews"><header><div><small>Monthly reviews</small><h3>Employee KPI reviews</h3></div><div><button className="secondary-button" type="button" onClick={downloadReport}>Download report</button><button className="primary-button" type="button" onClick={beginReview}>Create review</button></div></header><div className="next-kpi-review-tabs">{[["all", "All"], ["mine", "My KPIs"], ["created", "Created by me"]].map(([value, label]) => <button className={reviewTab === value ? "active" : ""} type="button" key={value} onClick={() => { setReviewTab(value); refreshReviews({ nextTab: value }).catch((err) => showToast(err.message, "error")); }}>{label}</button>)}</div><div className="next-kpi-review-filters"><label className="next-kpi-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, department, standard..." /></label><select value={filters.department} onChange={(e) => setFilters((current) => ({ ...current, department: e.target.value, position: "" }))}><option value="">All departments</option>{(meta.departments || []).map((value) => <option key={value}>{value}</option>)}</select><select value={filters.position} onChange={(e) => setFilters((current) => ({ ...current, position: e.target.value }))}><option value="">All positions</option>{unique(filters.department ? (meta.positionsByDepartment?.[lower(filters.department)] || []) : meta.positions || []).map((value) => <option key={value}>{value}</option>)}</select><select value={filters.standardId} onChange={(e) => setFilters((current) => ({ ...current, standardId: e.target.value }))}><option value="">All standards</option>{(meta.standards || []).map((standard) => <option key={standard.id} value={standard.id}>{standard.title}</option>)}</select><input type="month" value={filters.month} onChange={(e) => setFilters((current) => ({ ...current, month: e.target.value }))} /><button type="button" onClick={() => refreshReviews().catch((err) => showToast(err.message, "error"))}>Apply</button><button type="button" onClick={() => { const cleared = { department: "", position: "", standardId: "", month: "" }; setFilters(cleared); refreshReviews({ nextFilters: cleared }).catch((err) => showToast(err.message, "error")); }}>Clear</button></div><div className="next-kpi-review-table"><div className="next-kpi-review-row head"><span>Employee</span><span>Department</span><span>Month</span><span>Score</span><span /></div>{visibleReviews.length ? visibleReviews.map((review) => <div className="next-kpi-review-row" role="button" tabIndex={0} key={review.reviewId} onClick={() => openReview(review, false)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openReview(review, false); }}><span><strong>{review.teamMemberName || "—"}</strong><small>{review.standardTitle || review.rolePosition || "—"}</small></span><span>{review.department || "—"}</span><span>{fmtMonth(review.reviewMonth)}</span><span><b>{percent(review.finalPercentage)}</b><em>{review.performanceRating || "—"}</em></span><span>{rank(accessLevel) >= 3 && review.createdByTeamMemberId === currentUser.id ? <button type="button" onClick={(event) => { event.stopPropagation(); openReview(review, true); }}>Edit</button> : "›"}</span></div>) : <div className="next-kpi-empty">No KPI reviews match the selected filters.</div>}</div></article>

        <article className="next-kpi-panel next-kpi-panel--standards"><header><div><small>Standards</small><h3>KPI standards</h3></div><button className="primary-button" type="button" onClick={beginStandard}>Create</button></header><div className="next-kpi-standard-filters"><select value={standardFilters.department} onChange={(e) => setStandardFilters((current) => ({ ...current, department: e.target.value, position: "" }))}><option value="">All departments</option>{(meta.departments || []).map((value) => <option key={value}>{value}</option>)}</select><select value={standardFilters.position} onChange={(e) => setStandardFilters((current) => ({ ...current, position: e.target.value }))}><option value="">All positions</option>{unique(standardFilters.department ? (meta.positionsByDepartment?.[lower(standardFilters.department)] || []) : meta.positions || []).map((value) => <option key={value}>{value}</option>)}</select></div><div className="next-kpi-standard-cards">{visibleStandards.length ? visibleStandards.map((standard) => <button type="button" key={standard.id} onClick={() => setModal({ type: "standard-detail", standardId: standard.id })}><div><small>{standard.department || "No department"}</small><h4>{standard.title || "Untitled standard"}</h4><p>{standard.rolePosition || "No position"}</p></div><span><b>{fmtDate(standard.createdAt)}</b><em>Open ›</em></span></button>) : <div className="next-kpi-empty">No KPI standards match these filters.</div>}</div></article>
      </section>

      {modal?.type === "password" ? <PromptPassword title="Admin password required" message={modal.kind === "standard" ? "Only KPI Admin access can create standards directly. Enter the KPI admin password to continue." : "Create review requires Edit or Admin access. Enter the KPI admin password to continue."} onClose={() => setModal(null)} onSubmit={passwordAccepted} /> : null}
      {modal?.type === "standard" ? <StandardForm meta={meta} adminPassword={modal.password} onClose={() => setModal(null)} onSaved={onStandardSaved} /> : null}
      {modal?.type === "create-review" ? <ReviewCreate meta={meta} adminPassword={modal.password} onClose={() => setModal(null)} onCreated={onReviewCreated} /> : null}
      {modal?.type === "standard-detail" ? <StandardDetail standardId={modal.standardId} onClose={() => setModal(null)} /> : null}
      {modal?.type === "review" ? <ReviewDetail reviewId={modal.reviewId} editable={modal.editable} adminPassword={modal.adminPassword || ""} onClose={() => setModal(null)} onSaved={onReviewSaved} /> : null}
    </section>
  );
}
