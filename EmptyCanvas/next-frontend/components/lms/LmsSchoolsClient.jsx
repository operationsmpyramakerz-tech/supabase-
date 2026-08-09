"use client";

import { useMemo, useState } from "react";

const GOVERNORATES = [
  "Cairo", "Giza", "Alexandria", "Dakahlia", "Red Sea", "Beheira", "Fayoum", "Gharbia",
  "Ismailia", "Menofia", "Minya", "Qalyubia", "New Valley", "Suez", "Aswan", "Assiut",
  "Beni Suef", "Port Said", "Damietta", "Sharqia", "South Sinai", "Kafr El Sheikh",
  "Matrouh", "Luxor", "Qena", "North Sinai", "Sohag",
];
const EDUCATION_SYSTEMS = ["IG", "American", "British", "National"];
const SOLUTION_TYPES = ["Full Solution", "Lab solution", "STEAM Attack solution"];
const CONTRACT_STATUSES = ["Renewal", "New"];
const THEME_TYPES = Array.from({ length: 10 }, (_, index) => String(index + 1));
const GRADE_KEYS = Array.from({ length: 12 }, (_, index) => `g${index + 1}`);

const EMPTY_FIELDS = {
  school_name: "",
  contract_status: "",
  solution_type: "",
  theme_type: "",
  education_system: "",
  stocktaking_column: "",
  governorate: "",
  location: "",
  date_of_supply: "",
  contract_file: "",
  contract_period: "",
  accreditation: "",
  accreditation_time: "",
  coordinator_name: "",
  coordinator_phone: "",
  accountant_name: "",
  accountant_phone_number: "",
  number_of_instructor: "",
  max_students_largest_class: "",
  max_students_per_group: "",
  number_of_class: "",
  total_student_population: "",
  ...Object.fromEntries(GRADE_KEYS.map((key) => [key, false])),
};

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function splitValues(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;|]/).map(text).filter(Boolean);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSchool(item = {}) {
  const fields = item?.fields && typeof item.fields === "object" ? item.fields : {};
  const education = Array.isArray(item?.educationSystem) ? item.educationSystem : splitValues(fields.education_system);
  const grades = item?.grades && typeof item.grades === "object"
    ? item.grades
    : Object.fromEntries(GRADE_KEYS.map((key, index) => [index + 1, !!fields[key]]));
  return {
    id: text(item?.id),
    name: text(item?.name || fields.school_name) || "Untitled school",
    governorate: text(item?.governorate?.name || fields.governorate),
    solutionType: text(item?.programType || fields.solution_type),
    educationSystem: education,
    location: text(item?.location || fields.location),
    contractStatus: text(item?.contractStatus || fields.contract_status),
    stocktakingColumn: text(item?.stocktakingColumn || fields.stocktaking_column),
    grades,
    fields: { ...EMPTY_FIELDS, ...fields, school_name: text(fields.school_name || item?.name), governorate: text(fields.governorate || item?.governorate?.name), solution_type: text(fields.solution_type || item?.programType), education_system: text(fields.education_system || education.join(", ")), stocktaking_column: text(fields.stocktaking_column || item?.stocktakingColumn), location: text(fields.location || item?.location) },
  };
}

function initials(name) {
  return text(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SC";
}

function formatNumber(value) {
  return number(value).toLocaleString("en-GB");
}

function schoolSearchText(school) {
  const fields = school.fields || {};
  return lower([
    school.name,
    school.governorate,
    school.solutionType,
    school.educationSystem.join(" "),
    school.contractStatus,
    school.stocktakingColumn,
    fields.coordinator_name,
    fields.coordinator_phone,
    fields.accountant_name,
    fields.accountant_phone_number,
    fields.accreditation,
  ].join(" "));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (response.status === 401 && !url.includes("/admin/verify")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session expired.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(text(body?.error || body?.details) || "The request could not be completed.");
  return body;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read the selected file."));
    reader.readAsDataURL(file);
  });
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-lms-schools-toast ${toast.type === "error" ? "is-error" : ""}`} role="status">
      <div><strong>{toast.title || "LMS Schools"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function MultiChoice({ label, values, options, onChange }) {
  const active = new Set(values);
  return (
    <fieldset className="next-lms-school-choice">
      <legend>{label}</legend>
      <div>{options.map((option) => (
        <label className={active.has(option) ? "active" : ""} key={option}>
          <input
            type="checkbox"
            checked={active.has(option)}
            onChange={(event) => {
              const next = new Set(active);
              if (event.target.checked) next.add(option); else next.delete(option);
              onChange(Array.from(next));
            }}
          />
          <span>{option}</span>
        </label>
      ))}</div>
    </fieldset>
  );
}

function PasswordField({ value, onChange }) {
  return (
    <label className="next-lms-school-password">
      <span>Admin password</span>
      <input type="password" value={value} onChange={(event) => onChange(event.target.value)} autoComplete="current-password" placeholder="Required to save protected changes" />
      <small>The same protection used by the current Schools interface remains active.</small>
    </label>
  );
}

function SchoolFormModal({ school, stocktakingColumns, onClose, onSaved, onDeleted, onStockColumnCreated }) {
  const editing = !!school?.id;
  const [fields, setFields] = useState(() => ({ ...EMPTY_FIELDS, ...(school?.fields || {}) }));
  const [adminPassword, setAdminPassword] = useState("");
  const [contractFile, setContractFile] = useState(null);
  const [newColumn, setNewColumn] = useState("");
  const [busy, setBusy] = useState(false);
  const [columnBusy, setColumnBusy] = useState(false);
  const [error, setError] = useState("");

  function setField(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function uploadContractFile(currentFields) {
    if (!contractFile) return currentFields;
    if (contractFile.size > 10 * 1024 * 1024) throw new Error("The contract file must be 10 MB or less.");
    const dataUrl = await fileToDataUrl(contractFile);
    const uploaded = await requestJson("/api/b2b/upload-file", {
      method: "POST",
      body: JSON.stringify({ filename: contractFile.name, mime: contractFile.type || "application/octet-stream", dataUrl, adminPassword }),
    });
    return { ...currentFields, contract_file: uploaded.url || uploaded.publicUrl || currentFields.contract_file };
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    if (!text(fields.school_name)) return setError("School Name is required.");
    if (!text(adminPassword)) return setError("Enter the Admin password to save this school.");
    setBusy(true);
    try {
      const values = await uploadContractFile(fields);
      const result = await requestJson(editing ? `/api/b2b/schools/${encodeURIComponent(school.id)}` : "/api/b2b/schools", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ fields: values, adminPassword }),
      });
      onSaved(normalizeSchool(result), editing);
      onClose();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save the school.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || busy) return;
    if (!text(adminPassword)) return setError("Enter the Admin password before deleting this school.");
    if (!window.confirm(`Delete ${school.name}? This action cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/b2b/schools/${encodeURIComponent(school.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword }),
      });
      onDeleted(school.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError?.message || "Unable to delete the school.");
    } finally {
      setBusy(false);
    }
  }

  async function createStockColumn() {
    if (!text(newColumn)) return setError("Write a name for the Stocktaking column.");
    if (!text(adminPassword)) return setError("Enter the Admin password before creating a Stocktaking column.");
    setColumnBusy(true);
    setError("");
    try {
      const result = await requestJson("/api/b2b/stocktaking-columns", {
        method: "POST",
        body: JSON.stringify({ name: newColumn, adminPassword }),
      });
      const value = text(result.value || result.label || result.column || newColumn);
      onStockColumnCreated(value);
      setField("stocktaking_column", value);
      setNewColumn("");
    } catch (columnError) {
      setError(columnError?.message || "Unable to create the Stocktaking column.");
    } finally {
      setColumnBusy(false);
    }
  }

  const educationValues = splitValues(fields.education_system);
  const themeValues = splitValues(fields.theme_type);

  return (
    <div className="next-lms-school-modal" role="dialog" aria-modal="true" aria-label={editing ? `Edit ${school.name}` : "Add school"}>
      <button className="next-lms-school-modal-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <form className="next-lms-school-form" onSubmit={save}>
        <header>
          <div><span>{editing ? "Edit school record" : "New school record"}</span><h2>{editing ? school.name : "Add LMS School"}</h2><p>Maintain the school contract, contacts, academic coverage, and Stocktaking connection.</p></div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="next-lms-school-form-scroll">
          <section>
            <div className="next-lms-school-form-heading"><span>01</span><div><h3>Main data</h3><p>Primary commercial and education setup.</p></div></div>
            <div className="next-lms-school-form-grid">
              <label className="wide"><span>School Name *</span><input value={fields.school_name} onChange={(event) => setField("school_name", event.target.value)} placeholder="School name" /></label>
              <label><span>Contract Status</span><select value={fields.contract_status} onChange={(event) => setField("contract_status", event.target.value)}><option value="">Select status</option>{CONTRACT_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Solution Type</span><select value={fields.solution_type} onChange={(event) => setField("solution_type", event.target.value)}><option value="">Select solution</option>{SOLUTION_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <MultiChoice label="Education System" values={educationValues} options={EDUCATION_SYSTEMS} onChange={(values) => setField("education_system", values.join(", "))} />
              <MultiChoice label="Theme Type" values={themeValues} options={THEME_TYPES} onChange={(values) => setField("theme_type", values.join(", "))} />
            </div>
          </section>

          <section>
            <div className="next-lms-school-form-heading"><span>02</span><div><h3>Stocktaking</h3><p>Connect the school to its deployed stock column.</p></div></div>
            <div className="next-lms-school-form-grid">
              <label className="wide"><span>Stocktaking Column</span><select value={fields.stocktaking_column} onChange={(event) => setField("stocktaking_column", event.target.value)}><option value="">Select a column</option>{stocktakingColumns.map((column) => <option value={column} key={column}>{column}</option>)}</select></label>
              <label className="wide next-lms-school-inline-create"><span>Create a Stocktaking column</span><div><input value={newColumn} onChange={(event) => setNewColumn(event.target.value)} placeholder="Example: ACIC Done" /><button type="button" onClick={createStockColumn} disabled={columnBusy}>{columnBusy ? "Creating…" : "Add column"}</button></div></label>
            </div>
          </section>

          <section>
            <div className="next-lms-school-form-heading"><span>03</span><div><h3>Location and contract</h3><p>Supply date, contract evidence, and accreditation.</p></div></div>
            <div className="next-lms-school-form-grid">
              <label><span>Governorate</span><select value={fields.governorate} onChange={(event) => setField("governorate", event.target.value)}><option value="">Select governorate</option>{GOVERNORATES.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Date of Supply</span><input type="date" value={fields.date_of_supply || ""} onChange={(event) => setField("date_of_supply", event.target.value)} /></label>
              <label className="wide"><span>Google Maps Location</span><input type="url" value={fields.location} onChange={(event) => setField("location", event.target.value)} placeholder="https://maps.google.com/..." /></label>
              <label><span>Contract Period</span><input value={fields.contract_period} onChange={(event) => setField("contract_period", event.target.value)} placeholder="Example: 2026–2028" /></label>
              <label><span>Accreditation</span><input value={fields.accreditation} onChange={(event) => setField("accreditation", event.target.value)} /></label>
              <label><span>Accreditation Time</span><input value={fields.accreditation_time} onChange={(event) => setField("accreditation_time", event.target.value)} /></label>
              <label className="wide"><span>Existing Contract URL</span><input type="url" value={fields.contract_file} onChange={(event) => setField("contract_file", event.target.value)} placeholder="Public contract file URL" /></label>
              <label className="wide next-lms-school-file"><span>Upload Contract File</span><input type="file" onChange={(event) => setContractFile(event.target.files?.[0] || null)} /><small>{contractFile ? `${contractFile.name} • ${Math.max(1, Math.round(contractFile.size / 1024))} KB` : "PDF, image, or document up to 10 MB."}</small></label>
            </div>
          </section>

          <section>
            <div className="next-lms-school-form-heading"><span>04</span><div><h3>Team contacts</h3><p>School coordinator and finance contacts.</p></div></div>
            <div className="next-lms-school-form-grid">
              <label><span>Coordinator Name</span><input value={fields.coordinator_name} onChange={(event) => setField("coordinator_name", event.target.value)} /></label>
              <label><span>Coordinator Phone</span><input type="tel" value={fields.coordinator_phone} onChange={(event) => setField("coordinator_phone", event.target.value)} /></label>
              <label><span>Accountant Name</span><input value={fields.accountant_name} onChange={(event) => setField("accountant_name", event.target.value)} /></label>
              <label><span>Accountant Phone</span><input type="tel" value={fields.accountant_phone_number} onChange={(event) => setField("accountant_phone_number", event.target.value)} /></label>
            </div>
          </section>

          <section>
            <div className="next-lms-school-form-heading"><span>05</span><div><h3>Capacity and grades</h3><p>Instructor, class, student, and grade coverage.</p></div></div>
            <div className="next-lms-school-form-grid">
              <label><span>Number of Instructors</span><input type="number" min="0" value={fields.number_of_instructor} onChange={(event) => setField("number_of_instructor", event.target.value)} /></label>
              <label><span>Number of Classes</span><input type="number" min="0" value={fields.number_of_class} onChange={(event) => setField("number_of_class", event.target.value)} /></label>
              <label><span>Total Student Population</span><input type="number" min="0" value={fields.total_student_population} onChange={(event) => setField("total_student_population", event.target.value)} /></label>
              <label><span>Max Students / Largest Class</span><input type="number" min="0" value={fields.max_students_largest_class} onChange={(event) => setField("max_students_largest_class", event.target.value)} /></label>
              <label><span>Max Students / Group</span><input type="number" min="0" value={fields.max_students_per_group} onChange={(event) => setField("max_students_per_group", event.target.value)} /></label>
              <fieldset className="next-lms-school-grades wide"><legend>Grades</legend><div>{GRADE_KEYS.map((key, index) => <label className={fields[key] ? "active" : ""} key={key}><input type="checkbox" checked={!!fields[key]} onChange={(event) => setField(key, event.target.checked)} /><span>G{index + 1}</span></label>)}</div></fieldset>
            </div>
          </section>

          <PasswordField value={adminPassword} onChange={setAdminPassword} />
          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <footer>
          {editing ? <button className="danger-button" type="button" onClick={remove} disabled={busy}>Delete School</button> : <span />}
          <div><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save Changes" : "Create School"}</button></div>
        </footer>
      </form>
    </div>
  );
}

function SchoolDetailsModal({ school, onClose, onEdit }) {
  if (!school) return null;
  const fields = school.fields || {};
  const gradeLabels = GRADE_KEYS.map((key, index) => fields[key] || school.grades?.[index + 1] ? `G${index + 1}` : "").filter(Boolean);
  const details = [
    ["Contract status", school.contractStatus || fields.contract_status],
    ["Solution type", school.solutionType || fields.solution_type],
    ["Education system", school.educationSystem.join(", ") || fields.education_system],
    ["Theme type", fields.theme_type],
    ["Stocktaking column", school.stocktakingColumn || fields.stocktaking_column],
    ["Date of supply", fields.date_of_supply],
    ["Contract period", fields.contract_period],
    ["Accreditation", fields.accreditation],
    ["Accreditation time", fields.accreditation_time],
    ["Coordinator", fields.coordinator_name],
    ["Coordinator phone", fields.coordinator_phone],
    ["Accountant", fields.accountant_name],
    ["Accountant phone", fields.accountant_phone_number],
    ["Instructors", fields.number_of_instructor],
    ["Classes", fields.number_of_class],
    ["Student population", fields.total_student_population],
    ["Largest class", fields.max_students_largest_class],
    ["Students per group", fields.max_students_per_group],
    ["Grades", gradeLabels.join(", ")],
  ].filter(([, value]) => text(value));

  return (
    <div className="next-lms-school-modal" role="dialog" aria-modal="true" aria-label={`${school.name} details`}>
      <button className="next-lms-school-modal-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <section className="next-lms-school-details">
        <header><div className="next-lms-school-details-mark">{initials(school.name)}</div><div><span>LMS school record</span><h2>{school.name}</h2><p>{[school.governorate, school.solutionType].filter(Boolean).join(" • ") || "School operational profile"}</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <div className="next-lms-school-details-actions">
          <button className="primary-button" type="button" onClick={onEdit}>Edit record</button>
          <a className="secondary-button" href={`/next/lms/schools/${encodeURIComponent(school.id)}`}>Open school workspace</a>
          {school.location ? <a className="secondary-button" href={school.location} target="_blank" rel="noreferrer">Open map</a> : null}
          {fields.contract_file ? <a className="secondary-button" href={fields.contract_file} target="_blank" rel="noreferrer">Open contract</a> : null}
        </div>
        <div className="next-lms-school-details-grid">{details.map(([label, value]) => <article key={label}><small>{label}</small><strong>{String(value)}</strong></article>)}</div>
      </section>
    </div>
  );
}

export default function LmsSchoolsClient({ initialSchools, initialStocktakingColumns, initialCreate = false, initialEditId = "", access, bootstrapWarnings = [] }) {
  const [schools, setSchools] = useState(() => (Array.isArray(initialSchools) ? initialSchools : []).map(normalizeSchool));
  const [stocktakingColumns, setStocktakingColumns] = useState(() => {
    const raw = Array.isArray(initialStocktakingColumns?.columns) ? initialStocktakingColumns.columns : [];
    return Array.from(new Set(raw.map((item) => text(item?.value || item?.label || item)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  });
  const [query, setQuery] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [solution, setSolution] = useState("");
  const [contractStatus, setContractStatus] = useState("");
  const [sort, setSort] = useState("name");
  const [formSchool, setFormSchool] = useState(() => {
    if (initialCreate) return null;
    const requestedId = text(initialEditId);
    if (!requestedId) return undefined;
    const source = (Array.isArray(initialSchools) ? initialSchools : []).map(normalizeSchool);
    return source.find((school) => school.id === requestedId);
  });
  const [detailsSchool, setDetailsSchool] = useState(null);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const accessPage = (Array.isArray(access?.pages) ? access.pages : []).find((page) => lower(page?.pageKey || page?.page_key) === "lms-b2b");
  const accessLevel = lower(accessPage?.accessLevel || accessPage?.access_level || "view");
  const canManage = !!access?.isBuiltInAdmin || accessLevel === "edit" || accessLevel === "admin";

  const governorates = useMemo(() => Array.from(new Set(schools.map((item) => item.governorate).filter(Boolean))).sort(), [schools]);
  const solutions = useMemo(() => Array.from(new Set(schools.map((item) => item.solutionType).filter(Boolean))).sort(), [schools]);
  const contractStatuses = useMemo(() => Array.from(new Set(schools.map((item) => item.contractStatus).filter(Boolean))).sort(), [schools]);
  const filtered = useMemo(() => {
    const token = lower(query);
    const rows = schools.filter((school) => {
      if (token && !schoolSearchText(school).includes(token)) return false;
      if (governorate && school.governorate !== governorate) return false;
      if (solution && school.solutionType !== solution) return false;
      if (contractStatus && school.contractStatus !== contractStatus) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sort === "students-desc") return number(b.fields.total_student_population) - number(a.fields.total_student_population);
      if (sort === "instructors-desc") return number(b.fields.number_of_instructor) - number(a.fields.number_of_instructor);
      if (sort === "governorate") return a.governorate.localeCompare(b.governorate) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [schools, query, governorate, solution, contractStatus, sort]);

  const totalStudents = schools.reduce((sum, school) => sum + number(school.fields.total_student_population), 0);
  const totalInstructors = schools.reduce((sum, school) => sum + number(school.fields.number_of_instructor), 0);
  const activeContracts = schools.filter((school) => lower(school.contractStatus) === "new" || lower(school.contractStatus) === "renewal").length;

  function notify(message, type = "success") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }

  function upsertSchool(item, editing) {
    setSchools((current) => editing ? current.map((school) => school.id === item.id ? item : school) : [item, ...current]);
    notify(editing ? "The school record was updated." : "The school was created successfully.");
  }

  function deleteSchool(id) {
    setSchools((current) => current.filter((school) => school.id !== id));
    setDetailsSchool(null);
    notify("The school was deleted.");
  }

  function addStockColumn(value) {
    if (!value) return;
    setStocktakingColumns((current) => Array.from(new Set([...current, value])).sort((a, b) => a.localeCompare(b)));
    notify("The Stocktaking column was created.");
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const rows = await requestJson(`/api/b2b/schools?detail=1&t=${Date.now()}`);
      setSchools((Array.isArray(rows) ? rows : []).map(normalizeSchool));
      notify("Schools data was refreshed.");
    } catch (error) {
      notify(error?.message || "Unable to refresh Schools.", "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function openEdit(school) {
    setDetailsSchool(null);
    try {
      const detail = await requestJson(`/api/b2b/schools/${encodeURIComponent(school.id)}`);
      setFormSchool(normalizeSchool(detail));
    } catch (error) {
      notify(error?.message || "Unable to load the school record.", "error");
    }
  }

  return (
    <main className="next-lms-schools-page">
      <Toast toast={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some school support data could not load.</strong><span>The available school records are shown below.</span><a href="/lms/b2b">Open classic Schools</a></div> : null}

      <section className="next-lms-schools-hero">
        <div><span className="next-lms-kicker">LMS school operations</span><h2>Schools workspace</h2><p>Manage school contracts, academic coverage, contacts, capacity, and Stocktaking links from one protected workspace.</p><div><a href="/next/lms">LMS Overview</a><a href="/lms/b2b">Classic Schools</a></div></div>
        <div className="next-lms-schools-hero-actions"><button type="button" onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>{canManage ? <button type="button" onClick={() => setFormSchool(null)}>+ Add School</button> : null}</div>
      </section>

      <section className="next-lms-schools-summary" aria-label="Schools summary">
        <article><small>Schools</small><strong>{formatNumber(schools.length)}</strong><span>Active school folders</span></article>
        <article><small>Governorates</small><strong>{formatNumber(governorates.length)}</strong><span>Geographical coverage</span></article>
        <article><small>Students</small><strong>{formatNumber(totalStudents)}</strong><span>Recorded population</span></article>
        <article><small>Instructors</small><strong>{formatNumber(totalInstructors)}</strong><span>Recorded instructors</span></article>
        <article><small>Contracts</small><strong>{formatNumber(activeContracts)}</strong><span>New or renewal records</span></article>
      </section>

      <section className="next-lms-schools-toolbar">
        <label className="next-lms-schools-search"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="School, governorate, solution, contact…" /></label>
        <label><span>Governorate</span><select value={governorate} onChange={(event) => setGovernorate(event.target.value)}><option value="">All governorates</option>{governorates.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Solution</span><select value={solution} onChange={(event) => setSolution(event.target.value)}><option value="">All solutions</option>{solutions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Contract</span><select value={contractStatus} onChange={(event) => setContractStatus(event.target.value)}><option value="">All statuses</option>{contractStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">School name</option><option value="governorate">Governorate</option><option value="students-desc">Student population</option><option value="instructors-desc">Instructors</option></select></label>
        <div className="next-lms-schools-result"><strong>{filtered.length}</strong><span>shown</span></div>
      </section>

      <section className="next-lms-schools-grid">
        {filtered.length ? filtered.map((school) => {
          const grades = GRADE_KEYS.map((key, index) => school.fields[key] || school.grades?.[index + 1] ? `G${index + 1}` : "").filter(Boolean);
          return (
            <article className="next-lms-school-card" key={school.id}>
              <header><div className="next-lms-school-card-mark">{initials(school.name)}</div><div><span>{school.contractStatus || "School folder"}</span><h3>{school.name}</h3><p>{[school.governorate, school.solutionType].filter(Boolean).join(" • ") || "Open the school profile"}</p></div></header>
              <div className="next-lms-school-card-tags">{school.educationSystem.slice(0, 3).map((item) => <span key={item}>{item}</span>)}{grades.slice(0, 4).map((item) => <span key={item}>{item}</span>)}{grades.length > 4 ? <span>+{grades.length - 4}</span> : null}</div>
              <div className="next-lms-school-card-metrics"><div><small>Students</small><strong>{formatNumber(school.fields.total_student_population)}</strong></div><div><small>Instructors</small><strong>{formatNumber(school.fields.number_of_instructor)}</strong></div><div><small>Classes</small><strong>{formatNumber(school.fields.number_of_class)}</strong></div></div>
              <footer><button type="button" onClick={() => setDetailsSchool(school)}>View details</button><a href={`/next/lms/schools/${encodeURIComponent(school.id)}`}>Open workspace</a>{canManage ? <button type="button" onClick={() => openEdit(school)}>Edit</button> : null}</footer>
            </article>
          );
        }) : <div className="next-lms-schools-empty"><strong>No schools match the current filters</strong><span>Clear one or more filters or search for another school.</span><button type="button" onClick={() => { setQuery(""); setGovernorate(""); setSolution(""); setContractStatus(""); }}>Clear filters</button></div>}
      </section>

      {formSchool !== undefined ? <SchoolFormModal school={formSchool} stocktakingColumns={stocktakingColumns} onClose={() => setFormSchool(undefined)} onSaved={upsertSchool} onDeleted={deleteSchool} onStockColumnCreated={addStockColumn} /> : null}
      {detailsSchool ? <SchoolDetailsModal school={detailsSchool} onClose={() => setDetailsSchool(null)} onEdit={() => openEdit(detailsSchool)} /> : null}
    </main>
  );
}
