"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const ROLE_DEFINITIONS = [
  { key: "supervisors", kind: "supervisor", label: "Supervisor", plural: "Supervisors", mark: "SV" },
  { key: "team-leaders", kind: "team_leader", label: "Team Leader", plural: "Team Leaders", mark: "TL" },
  { key: "instructors", kind: "instructor", label: "Instructor", plural: "Instructors", mark: "IN" },
  { key: "co-instructors", kind: "co_instructor", label: "Co-Instructor", plural: "Co-Instructors", mark: "CI" },
  { key: "school-coordinators", kind: "school_coordinator", label: "School Coordinator", plural: "School Coordinators", mark: "SC" },
  { key: "students", kind: "students", label: "Student", plural: "Students", mark: "ST" },
  { key: "parents", kind: "parents", label: "Parent", plural: "Parents", mark: "PR" },
];

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "Recently created"
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function normalizeStructure(item, index = 0) {
  return {
    id: text(item?.id) || `structure-${index}`,
    name: text(item?.name) || "Untitled LMS Structure",
    schoolId: text(item?.selected_school_id || item?.school_id),
    schoolName: text(item?.selected_school_name || item?.school_name) || "School not assigned",
    createdAt: item?.created_at || item?.createdAt || "",
  };
}

function normalizeRoleItem(item, index = 0) {
  return {
    id: text(item?.id) || `role-${index}`,
    name: text(item?.name) || "Untitled record",
    schoolId: text(item?.school_id || item?.schoolId),
    schoolName: text(item?.school_name || item?.schoolName) || "Not assigned to a school",
    createdAt: item?.created_at || item?.createdAt || "",
  };
}

function apiErrorMessage(body, fallback) {
  return text(body?.error || body?.message) || fallback;
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

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session has expired.");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(apiErrorMessage(body, "The request failed."));
  return body;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-toast next-toast--${toast.type || "info"}`} role="status">
      <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}</span>
      <div><strong>{toast.title || "LMS Users Center"}</strong><small>{toast.message}</small></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function RoleModal({ role, schools, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!text(name)) return setError(`${role.label} name is required.`);
    const school = schools.find((item) => text(item.id) === text(schoolId));
    setBusy(true);
    setError("");
    try {
      const body = await requestJson(`/api/lms/users-center/roles/${encodeURIComponent(role.key)}`, {
        method: "POST",
        body: JSON.stringify({
          name: text(name),
          schoolId: school?.id || null,
          schoolName: school?.name || null,
        }),
      });
      onSaved(normalizeRoleItem(body?.item));
      onClose();
    } catch (saveError) {
      setError(saveError?.message || `Unable to add ${role.label}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="next-lms-role-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="lms-role-modal-title">
        <header>
          <div><span className="pill">LMS role directory</span><h2 id="lms-role-modal-title">Add New {role.label}</h2><p>Create a new record and optionally link it to a school.</p></div>
          <button className="next-modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </header>
        <div className="next-lms-role-modal__body">
          <label className="next-field"><span>{role.label} name <em>*</em></span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder={`Enter ${role.label.toLowerCase()} name`} /></label>
          <label className="next-field"><span>School</span><select value={schoolId} onChange={(event) => setSchoolId(event.target.value)}><option value="">Not assigned</option>{schools.map((school) => <option value={school.id} key={school.id}>{school.name}</option>)}</select></label>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <footer><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : `Add ${role.label}`}</button></footer>
      </form>
    </div>
  );
}

function StructureBuilder({ schools, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [connectingFrom, setConnectingFrom] = useState("");
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const boardRef = useRef(null);

  useEffect(() => {
    if (!drag) return undefined;
    const move = (event) => {
      const dx = (event.clientX - drag.startX) / zoom;
      const dy = (event.clientY - drag.startY) / zoom;
      setNodes((current) => current.map((node) => node.id === drag.id
        ? { ...node, x: Math.max(20, drag.originX + dx), y: Math.max(20, drag.originY + dy) }
        : node));
    };
    const stop = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [drag, zoom]);

  const selectedSchool = schools.find((school) => text(school.id) === text(schoolId));

  function addNode(definition) {
    const index = nodes.length;
    const column = index % 4;
    const row = Math.floor(index / 4);
    setNodes((current) => [...current, {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind: definition.kind,
      label: definition.label,
      mark: definition.mark,
      x: 45 + column * 235,
      y: 45 + row * 145,
    }]);
  }

  function removeNode(id) {
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.from !== id && edge.to !== id));
    if (connectingFrom === id) setConnectingFrom("");
  }

  function connectTo(id) {
    if (!connectingFrom) return setConnectingFrom(id);
    if (connectingFrom === id) return setConnectingFrom("");
    setEdges((current) => current.some((edge) => edge.from === connectingFrom && edge.to === id)
      ? current
      : [...current, { from: connectingFrom, to: id }]);
    setConnectingFrom("");
  }

  async function save() {
    if (!selectedSchool) return setError("Choose a school before creating the structure.");
    if (!nodes.length) return setError("Add at least one role block.");
    setBusy(true);
    setError("");
    try {
      const structureName = text(name) || `${selectedSchool.name} Structure`;
      const body = await requestJson("/api/lms/structures", {
        method: "POST",
        body: JSON.stringify({
          name: structureName,
          schoolId: selectedSchool.id,
          schoolName: selectedSchool.name,
          nodes: nodes.map((node) => ({ clientId: node.id, kind: node.kind, x: Math.round(node.x), y: Math.round(node.y) })),
          edges,
        }),
      });
      onSaved(normalizeStructure(body?.structure));
      onClose();
    } catch (saveError) {
      setError(saveError?.message || "Unable to create LMS structure.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="next-modal-backdrop next-lms-builder-layer" role="presentation">
      <section className="next-lms-builder" role="dialog" aria-modal="true" aria-labelledby="lms-builder-title">
        <header>
          <div><span className="pill">Visual learning workflow</span><h2 id="lms-builder-title">Create LMS Structure</h2><p>Add role blocks, drag them into place, then connect the learning workflow.</p></div>
          <button className="next-modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </header>

        <div className="next-lms-builder-controls">
          <label className="next-field"><span>School <em>*</em></span><select value={schoolId} onChange={(event) => { setSchoolId(event.target.value); const school = schools.find((item) => text(item.id) === text(event.target.value)); if (school && !text(name)) setName(`${school.name} Structure`); }}><option value="">Select a school</option>{schools.map((school) => <option value={school.id} key={school.id}>{school.name}</option>)}</select></label>
          <label className="next-field"><span>Structure name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Green Valley School Structure" /></label>
          <div className="next-lms-builder-zoom"><button type="button" onClick={() => setZoom((value) => Math.max(.65, value - .1))}>−</button><strong>{Math.round(zoom * 100)}%</strong><button type="button" onClick={() => setZoom((value) => Math.min(1.4, value + .1))}>+</button></div>
        </div>

        <div className="next-lms-builder-rolebar" aria-label="Add role block">
          {ROLE_DEFINITIONS.map((role) => <button type="button" onClick={() => addNode(role)} key={role.key}><span>{role.mark}</span>{role.label}</button>)}
        </div>

        <div className="next-lms-builder-canvas-wrap">
          <div className="next-lms-builder-canvas" ref={boardRef} style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <svg viewBox="0 0 1120 720" aria-hidden="true">
              {edges.map((edge, index) => {
                const from = nodes.find((node) => node.id === edge.from);
                const to = nodes.find((node) => node.id === edge.to);
                if (!from || !to) return null;
                const x1 = from.x + 190;
                const y1 = from.y + 51;
                const x2 = to.x;
                const y2 = to.y + 51;
                const middle = Math.max(50, Math.abs(x2 - x1) * .45);
                return <path d={`M ${x1} ${y1} C ${x1 + middle} ${y1}, ${x2 - middle} ${y2}, ${x2} ${y2}`} key={`${edge.from}-${edge.to}-${index}`} />;
              })}
            </svg>
            {!nodes.length ? <div className="next-lms-builder-empty"><strong>Your workflow canvas is ready</strong><span>Choose a role above to add the first block.</span></div> : null}
            {nodes.map((node, index) => (
              <article className={`next-lms-builder-node${connectingFrom === node.id ? " is-source" : ""}`} style={{ left: node.x, top: node.y }} key={node.id}>
                <header onPointerDown={(event) => { event.preventDefault(); setDrag({ id: node.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y }); }}>
                  <span>{index + 1}</span><strong>{node.label}</strong><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => removeNode(node.id)} aria-label={`Remove ${node.label}`}>×</button>
                </header>
                <div><b>{node.mark}</b><small>{connectingFrom && connectingFrom !== node.id ? "Click Link here" : "Drag to reposition"}</small></div>
                <button className="next-lms-node-connect" type="button" onClick={() => connectTo(node.id)}>{connectingFrom && connectingFrom !== node.id ? "Link here" : connectingFrom === node.id ? "Cancel link" : "Connect"}</button>
              </article>
            ))}
          </div>
        </div>

        {error ? <p className="form-error next-lms-builder-error">{error}</p> : null}
        <footer><div><span>{nodes.length} blocks</span><span>{edges.length} connections</span></div><div><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" type="button" onClick={save} disabled={busy}>{busy ? "Creating…" : "Create Structure"}</button></div></footer>
      </section>
    </div>
  );
}

export default function LmsUsersCenterClient({ initialStructures, initialSchools, initialRoles, access, bootstrapWarnings = [] }) {
  const [structures, setStructures] = useState(() => (Array.isArray(initialStructures?.structures) ? initialStructures.structures : []).map(normalizeStructure));
  const [schools] = useState(() => (Array.isArray(initialSchools?.schools) ? initialSchools.schools : []).map((school) => ({ id: text(school?.id), name: text(school?.name) || "Untitled school" })).filter((school) => school.id));
  const [roleItems, setRoleItems] = useState(() => Object.fromEntries(ROLE_DEFINITIONS.map((role) => [role.key, (Array.isArray(initialRoles?.[role.key]?.items) ? initialRoles[role.key].items : []).map(normalizeRoleItem)])));
  const [activeTab, setActiveTab] = useState("structures");
  const [query, setQuery] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [roleModal, setRoleModal] = useState(null);
  const [toast, setToast] = useState(null);

  const accessPage = (Array.isArray(access?.pages) ? access.pages : []).find((page) => lower(page?.pageKey || page?.page_key) === "lms-users-center");
  const accessLevel = lower(accessPage?.accessLevel || accessPage?.access_level || "view");
  const canEdit = !!access?.isBuiltInAdmin || accessLevel === "edit" || accessLevel === "admin";
  const roleCount = useMemo(() => Object.values(roleItems).reduce((sum, items) => sum + items.length, 0), [roleItems]);
  const schoolCoverage = useMemo(() => new Set(structures.map((item) => item.schoolId).filter(Boolean)).size, [structures]);
  const activeRole = ROLE_DEFINITIONS.find((role) => role.key === activeTab);

  const visibleStructures = useMemo(() => {
    const token = lower(query);
    if (!token) return structures;
    return structures.filter((item) => lower(`${item.name} ${item.schoolName}`).includes(token));
  }, [structures, query]);

  const visibleRoleItems = useMemo(() => {
    if (!activeRole) return [];
    const token = lower(query);
    const items = roleItems[activeRole.key] || [];
    if (!token) return items;
    return items.filter((item) => lower(`${item.name} ${item.schoolName}`).includes(token));
  }, [activeRole, query, roleItems]);

  function notify(message, type = "success", title = "LMS Users Center") {
    setToast({ message, type, title });
    window.setTimeout(() => setToast(null), 3500);
  }

  function addStructure(item) {
    setStructures((current) => [item, ...current]);
    notify("The learning structure was created successfully.");
  }

  function addRoleItem(roleKey, item) {
    setRoleItems((current) => ({ ...current, [roleKey]: [item, ...(current[roleKey] || [])] }));
    notify("The LMS role record was added successfully.");
  }

  return (
    <main className="next-lms-users-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some LMS directory data could not load.</strong><span>The available structures and roles are shown below.</span><a href="/lms/user-access">Open classic Users Center</a></div> : null}

      <section className="next-lms-users-hero">
        <div><span className="next-lms-kicker">LMS Users Center</span><h2>Learning teams, directories, and school structures</h2><p>Build the learning hierarchy for every school and maintain the role folders used across the LMS workspace.</p></div>
        <div className="next-lms-users-hero-actions"><a href="/next/lms">LMS Overview</a><a href="/lms/user-access">Classic Users Center</a>{canEdit ? <button type="button" onClick={() => setBuilderOpen(true)}>Add Structure</button> : null}</div>
      </section>

      <section className="next-lms-users-summary" aria-label="LMS Users Center summary">
        <article><small>Structures</small><strong>{structures.length}</strong><span>Saved learning workflows</span></article>
        <article><small>Role records</small><strong>{roleCount}</strong><span>Across seven directories</span></article>
        <article><small>Schools covered</small><strong>{schoolCoverage}</strong><span>Schools with structures</span></article>
        <article><small>Access level</small><strong>{access?.isBuiltInAdmin ? "Admin" : accessLevel || "View"}</strong><span>{canEdit ? "Create actions enabled" : "Read-only workspace"}</span></article>
      </section>

      <section className="next-lms-users-workspace">
        <div className="next-lms-users-tabs" role="tablist" aria-label="LMS Users Center directories">
          <button type="button" className={activeTab === "structures" ? "active" : ""} onClick={() => { setActiveTab("structures"); setQuery(""); }}><span>WF</span><b>Learning Structures</b><em>{structures.length}</em></button>
          {ROLE_DEFINITIONS.map((role) => <button type="button" className={activeTab === role.key ? "active" : ""} onClick={() => { setActiveTab(role.key); setQuery(""); }} key={role.key}><span>{role.mark}</span><b>{role.plural}</b><em>{roleItems[role.key]?.length || 0}</em></button>)}
        </div>

        <div className="next-lms-users-toolbar">
          <label><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={activeTab === "structures" ? "Search structures or schools" : `Search ${activeRole?.plural.toLowerCase() || "records"}`} /></label>
          <div><strong>{activeTab === "structures" ? visibleStructures.length : visibleRoleItems.length}</strong><span>{activeTab === "structures" ? "structures shown" : `${activeRole?.plural || "records"} shown`}</span></div>
          {canEdit ? activeTab === "structures" ? <button className="primary-button" type="button" onClick={() => setBuilderOpen(true)}>+ Add Structure</button> : <button className="primary-button" type="button" onClick={() => setRoleModal(activeRole)}>+ Add {activeRole?.label}</button> : null}
        </div>

        {activeTab === "structures" ? (
          <section className="next-lms-structure-grid">
            {visibleStructures.length ? visibleStructures.map((item) => (
              <article key={item.id}>
                <div className="next-lms-structure-card-mark">WF</div>
                <div><span>Learning structure</span><h3>{item.name}</h3><p>{item.schoolName}</p></div>
                <footer><small>{formatDate(item.createdAt)}</small><b>School workflow</b></footer>
              </article>
            )) : <div className="next-lms-users-empty"><strong>No learning structures found</strong><span>{query ? "Try another search term." : canEdit ? "Create the first school workflow using Add Structure." : "No structures are available yet."}</span></div>}
          </section>
        ) : (
          <section className="next-lms-role-grid">
            {visibleRoleItems.length ? visibleRoleItems.map((item) => (
              <article key={item.id}>
                <div className="next-lms-role-card-mark">{activeRole?.mark}</div>
                <div><span>{activeRole?.label}</span><h3>{item.name}</h3><p>{item.schoolName}</p></div>
                <footer><small>{formatDate(item.createdAt)}</small><b>{activeRole?.plural}</b></footer>
              </article>
            )) : <div className="next-lms-users-empty"><strong>No {activeRole?.plural.toLowerCase()} found</strong><span>{query ? "Try another search term." : canEdit ? `Use Add ${activeRole?.label} to create the first record.` : "No records are available yet."}</span></div>}
          </section>
        )}
      </section>

      {builderOpen ? <StructureBuilder schools={schools} onClose={() => setBuilderOpen(false)} onSaved={addStructure} /> : null}
      {roleModal ? <RoleModal role={roleModal} schools={schools} onClose={() => setRoleModal(null)} onSaved={(item) => addRoleItem(roleModal.key, item)} /> : null}
    </main>
  );
}
