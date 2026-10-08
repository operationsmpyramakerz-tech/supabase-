"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ActionLoadingModal, { useActionLoading } from "../ActionLoadingModal";
import ClassicTaskSelect from "./ClassicTaskSelect";

const WORK_STATUS_OPTIONS = [
  ["not_started", "Not started"],
  ["in_progress", "In progress"],
  ["rejected", "Rejected"],
  ["completed", "Completed"],
];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];


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
function statusLabel(value) {
  return ({
    not_started: "Not started",
    in_progress: "In progress",
    rejected: "Rejected",
    completed: "Completed",
    cancelled: "Cancelled",
  })[text(value)] || "Not started";
}
function priorityKey(value) {
  const key = lower(value);
  return ["urgent", "high", "low"].includes(key) ? key : "normal";
}
function dateKey(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const raw = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}
function dateFromKey(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
function formatDate(value, fallback = "No date") {
  const key = dateKey(value);
  const date = dateFromKey(key);
  if (!date) return fallback;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function formatDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function todayKey() {
  return dateKey(new Date());
}
function newClientId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function fileSize(bytes) {
  const size = number(bytes);
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function ticketStats(ticket, view) {
  const scoped = view === "my";
  const total = scoped && Number.isFinite(Number(ticket?.viewerSectionsCount))
    ? number(ticket.viewerSectionsCount)
    : number(ticket?.sectionsCount);
  const completed = scoped && Number.isFinite(Number(ticket?.viewerCompletedCount))
    ? number(ticket.viewerCompletedCount)
    : number(ticket?.completedCount);
  const progress = scoped && Number.isFinite(Number(ticket?.viewerProgress))
    ? number(ticket.viewerProgress)
    : (total ? Math.round((completed / total) * 100) : 0);
  return { total: Math.max(0, total), completed: Math.max(0, completed), progress: Math.max(0, Math.min(100, progress)) };
}
function apiError(body, fallback = "The request failed.") {
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
  if (response.status === 401 && !options.allow401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session has expired.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    const error = new Error(apiError(body));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}
async function fallbackTaskUpload(file, view) {
  const dataUrl = await readAsDataUrl(file);
  const payload = await requestJson(`/next/api/task-management/upload-direct?view=${encodeURIComponent(view)}`, {
    method: "POST",
    body: JSON.stringify({ view, dataUrl, filename: file.name, mime: file.type || "", size: file.size }),
  });
  return payload.file;
}
async function uploadTaskFile(file, view) {
  if (!file) throw new Error("Choose a file first.");
  if (number(file.size) > 10 * 1024 * 1024) throw new Error("Attachments must be 10 MB or less.");
  try {
    const ticketResponse = await fetch("/next/api/storage/upload-ticket", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "task-management", filename: file.name, mime: file.type || "application/octet-stream", size: file.size }),
    });
    const ticket = await ticketResponse.json().catch(() => ({}));
    if (!ticketResponse.ok || !ticket?.upload?.signedUrl || !ticket?.uploadRef) {
      if (ticket?.fallbackAllowed || ticketResponse.status === 404 || ticketResponse.status >= 500) return fallbackTaskUpload(file, view);
      throw new Error(apiError(ticket, "Could not prepare the upload."));
    }
    const put = await fetch(ticket.upload.signedUrl, {
      method: ticket.upload.method || "PUT",
      headers: ticket.upload.headers || { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) throw new Error(`Storage upload failed with status ${put.status}.`);
    const complete = await requestJson("/next/api/storage/upload-complete", {
      method: "POST",
      body: JSON.stringify({ uploadRef: ticket.uploadRef }),
    });
    return complete.file;
  } catch (error) {
    if (/network|fetch|storage upload failed/i.test(text(error?.message))) return fallbackTaskUpload(file, view);
    throw error;
  }
}
async function uploadTaskFiles(files, view) {
  const output = [];
  for (const file of Array.from(files || [])) output.push(await uploadTaskFile(file, view));
  return output;
}
function mergeAttachments(current, next) {
  const map = new Map();
  for (const item of [...(Array.isArray(current) ? current : []), ...(Array.isArray(next) ? next : [])]) {
    if (!item?.url) continue;
    map.set(String(item.url), { ...item });
  }
  return [...map.values()];
}
function ticketDepartments(ticket) {
  return [...new Set((ticket?.sections || []).map((section) => text(section?.department)).filter(Boolean))];
}
function ticketSearchText(ticket) {
  return lower([
    ticket?.ticketCode, ticket?.title, ticket?.description, ticket?.createdByName,
    ...(ticket?.sections || []).flatMap((section) => [section?.department, section?.request, section?.details, section?.deliveryDate, ...(section?.attachments || []).map((file) => file?.name)]),
  ].join(" "));
}
function dependenciesFor(items, edges, targetId) {
  return (Array.isArray(edges) ? edges : [])
    .filter((edge) => text(edge?.to) === text(targetId))
    .map((edge) => text(edge?.from))
    .filter((id) => items.some((item) => text(item.clientId || item.id) === id));
}

// Classic Task Management workflow numbering. The number comes from the arrow
// dependency graph, not from the order blocks were created. A single block in
// a dependency level is 1, 2, 3... while parallel blocks in the same level
// become 1.1 / 1.2, 2.1 / 2.2, etc., ordered by their canvas position.
function workflowNumbering(nodes = [], edges = []) {
  const records = (Array.isArray(nodes) ? nodes : []).map((node, index) => ({
    node,
    id: text(node?.clientId || node?.id),
    index,
  }));
  const recordById = new Map(records.filter((record) => record.id).map((record) => [record.id, record]));
  const outgoing = new Map(records.map((record) => [record.id, []]));
  const incoming = new Map(records.map((record) => [record.id, 0]));

  (Array.isArray(edges) ? edges : []).forEach((edge) => {
    const from = text(edge?.from ?? edge?.fromSectionId ?? edge?.from_section_id);
    const to = text(edge?.to ?? edge?.toSectionId ?? edge?.to_section_id);
    if (!recordById.has(from) || !recordById.has(to) || from === to) return;
    outgoing.get(from).push(to);
    incoming.set(to, (incoming.get(to) || 0) + 1);
  });

  const rank = new Map(records.map((record) => [record.id, 1]));
  const queue = records
    .filter((record) => incoming.get(record.id) === 0)
    .sort((a, b) => (number(a.node?.canvasX) - number(b.node?.canvasX)) || (number(a.node?.canvasY) - number(b.node?.canvasY)) || (a.index - b.index))
    .map((record) => record.id);
  let processed = 0;

  while (queue.length) {
    const id = queue.shift();
    processed += 1;
    (outgoing.get(id) || []).forEach((nextId) => {
      rank.set(nextId, Math.max(rank.get(nextId) || 1, (rank.get(id) || 1) + 1));
      incoming.set(nextId, (incoming.get(nextId) || 0) - 1);
      if (incoming.get(nextId) === 0) queue.push(nextId);
    });
  }

  // Keep temporary blocks labelled even before an invalid circular graph is fixed.
  if (processed !== records.length) records.forEach((record, index) => rank.set(record.id, index + 1));

  const layers = new Map();
  records.forEach((record) => {
    const level = rank.get(record.id) || 1;
    if (!layers.has(level)) layers.set(level, []);
    layers.get(level).push(record);
  });

  const labels = new Map();
  [...layers.entries()].sort((a, b) => a[0] - b[0]).forEach(([level, layer]) => {
    layer
      .slice()
      .sort((a, b) => (number(a.node?.canvasY) - number(b.node?.canvasY)) || (number(a.node?.canvasX) - number(b.node?.canvasX)) || (a.index - b.index))
      .forEach((record, index) => labels.set(record.id, layer.length === 1 ? String(level) : `${level}.${index + 1}`));
  });
  return labels;
}

function orderedWorkflowNodes(nodes = [], labels = new Map()) {
  const parts = (node) => text(labels.get(text(node?.clientId || node?.id))).split('.').map((part) => number(part));
  return (Array.isArray(nodes) ? nodes : []).slice().sort((a, b) => {
    const aa = parts(a);
    const bb = parts(b);
    if ((aa[0] || 0) !== (bb[0] || 0)) return (aa[0] || 0) - (bb[0] || 0);
    if ((aa[1] || 0) !== (bb[1] || 0)) return (aa[1] || 0) - (bb[1] || 0);
    return (number(a?.canvasY) - number(b?.canvasY)) || (number(a?.canvasX) - number(b?.canvasX));
  });
}

function readBuilderSocketAnchors(board, orientation = "horizontal") {
  if (!board) return {};
  const result = {};
  const boardRect = board.getBoundingClientRect();
  const scaleX = board.offsetWidth ? boardRect.width / board.offsetWidth : 1;
  const scaleY = board.offsetHeight ? boardRect.height / board.offsetHeight : scaleX;
  board.querySelectorAll("[data-builder-node]").forEach((block) => {
    const id = block.getAttribute("data-builder-node");
    if (!id) return;
    const source = block.querySelector(orientation === "vertical" ? ".tm-builder-socket--bottom" : ".tm-builder-socket--out");
    const target = block.querySelector(orientation === "vertical" ? ".tm-builder-socket--top" : ".tm-builder-socket--in");
    const center = (socket) => {
      if (!socket) return null;
      const rect = socket.getBoundingClientRect();
      return {
        x: (rect.left + (rect.width / 2) - boardRect.left) / Math.max(.001, scaleX),
        y: (rect.top + (rect.height / 2) - boardRect.top) / Math.max(.001, scaleY),
      };
    };
    result[id] = { out: center(source), in: center(target), width: block.offsetWidth, height: block.offsetHeight };
  });
  return result;
}

function builderArrowPath(fromId, toId, anchors, fallbackFrom, fallbackTo, orientation = "horizontal") {
  const fromAnchor = anchors?.[fromId]?.out;
  const toAnchor = anchors?.[toId]?.in;
  let sx; let sy; let tx; let ty;
  if (fromAnchor && toAnchor) {
    sx = fromAnchor.x; sy = fromAnchor.y; tx = toAnchor.x; ty = toAnchor.y;
  } else if (orientation === "vertical") {
    sx = number(fallbackFrom?.canvasX) + 150;
    sy = number(fallbackFrom?.canvasY) + 170;
    tx = number(fallbackTo?.canvasX) + 150;
    ty = number(fallbackTo?.canvasY);
  } else {
    sx = number(fallbackFrom?.canvasX) + 300;
    sy = number(fallbackFrom?.canvasY) + 86;
    tx = number(fallbackTo?.canvasX);
    ty = number(fallbackTo?.canvasY) + 86;
  }
  if (orientation === "vertical") {
    const distance = Math.max(78, Math.abs(ty - sy) * .48);
    const direction = ty >= sy ? 1 : -1;
    return `M ${sx} ${sy} C ${sx} ${sy + (distance * direction)}, ${tx} ${ty - (distance * direction)}, ${tx} ${ty}`;
  }
  const distance = Math.max(95, Math.abs(tx - sx) * .48);
  const direction = tx >= sx ? 1 : -1;
  return `M ${sx} ${sy} C ${sx + (distance * direction)} ${sy}, ${tx - (distance * direction)} ${ty}, ${tx} ${ty}`;
}


function FeatherIcon({ name, className = "" }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className };
  const paths = {
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    circle: <circle cx="12" cy="12" r="10"/>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
    "check-circle": <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
    filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    "plus-square": <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    "chevron-left": <polyline points="15 18 9 12 15 6"/>,
    "chevron-right": <polyline points="9 18 15 12 9 6"/>,
    "chevron-down": <polyline points="6 9 12 15 18 9"/>,
    "git-branch": <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>,
    "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    minus: <line x1="5" y1="12" x2="19" y2="12"/>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    "more-vertical": <><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m3 0V4h8v2"/></>,
    move: <><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"/></>,
  };
  return <svg {...common}>{paths[name] || paths["git-branch"]}</svg>;
}

function statusIconName(status) {
  return ({ not_started: "circle", in_progress: "activity", completed: "check-circle", rejected: "x", cancelled: "x" })[text(status)] || "circle";
}


function StatusPill({ status, archived = false, onRejected = null }) {
  if (archived) return <span className="tm-archive-pill"><FeatherIcon name="archive" />Archived</span>;
  const cls = `tm-status-pill tm-status--${text(status)}`;
  if (text(status) === "rejected" && onRejected) return <button type="button" className={`${cls} tm-status-pill--clickable`} onClick={(event) => { event.stopPropagation(); onRejected(); }}><FeatherIcon name={statusIconName(status)} />{statusLabel(status)}</button>;
  return <span className={cls}><FeatherIcon name={statusIconName(status)} />{statusLabel(status)}</span>;
}

function PriorityPill({ priority }) {
  return <span className={`next-task-priority next-task-priority--${priorityKey(priority)} tm-priority tm-priority--${priorityKey(priority)}`}>{text(priority) || "Normal"}</span>;
}

function AttachmentLinks({ attachments, empty = null, onRemove = null }) {
  const files = Array.isArray(attachments) ? attachments.filter((item) => item?.url) : [];
  if (!files.length) return empty ? <p className="next-task-muted">{empty}</p> : null;
  return (
    <div className="next-task-files">
      {files.map((file, index) => (
        <div className="next-task-files__item" key={`${file.url}-${index}`}>
          <a href={file.url} target="_blank" rel="noreferrer">
            <span>↗</span><div><strong>{file.name || "Open attachment"}</strong><small>{fileSize(file.size) || file.type || "Attached file"}</small></div>
          </a>
          {onRemove ? <button type="button" className="next-task-file-remove" onClick={() => onRemove(index, file)} aria-label={`Remove ${file.name || "attachment"}`} title="Remove file"><FeatherIcon name="x" /></button> : null}
        </div>
      ))}
    </div>
  );
}


function ProjectEditor({ editor, meta, view, onClose, onSaved, notify }) {
  const [draft, setDraft] = useState(() => ({ ...editor, sections: (editor.sections || []).map((section, index) => ({ ...section, canvasX: number(section.canvasX) || 80 + (index % 3) * 340, canvasY: number(section.canvasY) || 80 + Math.floor(index / 3) * 220 })) }));
  const [mode, setMode] = useState(editor.id ? "builder" : "meta");
  const [blockId, setBlockId] = useState("");
  const [connectFrom, setConnectFrom] = useState("");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [builderStarted, setBuilderStarted] = useState(() => (editor.sections || []).length > 0);
  const { actionLoading, startActionLoading, finishActionLoading } = useActionLoading();
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 900 });
  const [anchors, setAnchors] = useState({});
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const boardRef = useRef(null);
  const canvasSizeRef = useRef({ width: 1280, height: 900 });

  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const updateSection = (clientId, key, value) => setDraft((current) => ({ ...current, sections: current.sections.map((section) => section.clientId === clientId ? { ...section, [key]: value } : section) }));
  const addSection = () => {
    setBuilderStarted(true);
    setDraft((current) => {
    const clientId = newClientId("section");
    const index = current.sections.length;
    const wrap = canvasWrapRef.current;
    const centerX = wrap ? (wrap.scrollLeft + (wrap.clientWidth / 2)) / zoom : 640;
    const centerY = wrap ? (wrap.scrollTop + (wrap.clientHeight / 2)) / zoom : 360;
    const column = index % 3;
    const row = Math.floor(index / 3);
    const next = {
      clientId, department: "", request: "", details: "", deliveryDate: current.dueDate || "", attachments: [], dependsOn: [],
      canvasX: Math.max(70, Math.round(centerX - 150 + (column - 1) * 330)),
      canvasY: Math.max(80, Math.round(centerY - 86 + row * 230)),
    };
    window.setTimeout(() => setBlockId(clientId), 0);
    return { ...current, sections: [...current.sections, next] };
    });
  };
  const removeSection = (clientId) => setDraft((current) => ({ ...current, sections: current.sections.filter((section) => section.clientId !== clientId).map((section) => ({ ...section, dependsOn: (section.dependsOn || []).filter((id) => id !== clientId) })) }));
  const chooseFiles = async (clientId, files) => {
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!selectedFiles.length) return;
    setUploading(clientId); setError("");
    startActionLoading({
      title: "Uploading files",
      message: `Uploading ${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} to this workflow block…`,
    });
    try {
      const uploaded = await uploadTaskFiles(selectedFiles, view);
      setDraft((current) => ({ ...current, sections: current.sections.map((section) => section.clientId === clientId ? { ...section, attachments: mergeAttachments(section.attachments, uploaded) } : section) }));
      await finishActionLoading("done", `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} uploaded successfully.`);
    } catch (uploadError) {
      const message = uploadError?.message || "The attachments could not be uploaded.";
      setError(message);
      await finishActionLoading("failed", message);
    } finally { setUploading(""); }
  };
  const removeAttachment = (clientId, index, file) => {
    setDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => section.clientId === clientId
        ? { ...section, attachments: (Array.isArray(section.attachments) ? section.attachments : []).filter((attachment, fileIndex) => file?.url ? text(attachment?.url) !== text(file.url) : fileIndex !== index) }
        : section),
    }));
  };
  const continueToBuilder = (event) => {
    event?.preventDefault?.(); setError("");
    if (!text(draft.title) || !dateKey(draft.dueDate)) return setError("Project title, priority, and target date are required.");
    setMode("builder");
  };
  const toggleConnection = (toId) => {
    if (!connectFrom || connectFrom === toId) { setConnectFrom(""); return; }
    setDraft((current) => ({ ...current, sections: current.sections.map((section) => {
      if (section.clientId !== toId) return section;
      const set = new Set(section.dependsOn || []);
      if (set.has(connectFrom)) set.delete(connectFrom); else set.add(connectFrom);
      return { ...section, dependsOn: [...set] };
    }) }));
    setConnectFrom("");
  };
  const expandCanvas = ({ left = 0, top = 0, right = 0, bottom = 0 } = {}) => {
    const shiftX = Math.max(0, Math.ceil(number(left)));
    const shiftY = Math.max(0, Math.ceil(number(top)));
    const growRight = Math.max(0, Math.ceil(number(right)));
    const growBottom = Math.max(0, Math.ceil(number(bottom)));
    if (!(shiftX || shiftY || growRight || growBottom)) return;
    const currentSize = canvasSizeRef.current;
    const nextSize = {
      width: Math.max(1280, currentSize.width + shiftX + growRight),
      height: Math.max(900, currentSize.height + shiftY + growBottom),
    };
    canvasSizeRef.current = nextSize;
    setCanvasSize(nextSize);
    if (shiftX || shiftY) {
      setDraft((current) => ({
        ...current,
        sections: current.sections.map((section) => ({
          ...section,
          canvasX: number(section.canvasX) + shiftX,
          canvasY: number(section.canvasY) + shiftY,
        })),
      }));
      if (dragRef.current) {
        dragRef.current.x += shiftX;
        dragRef.current.y += shiftY;
      }
    }
    window.requestAnimationFrame(() => {
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      if (shiftX) wrap.scrollLeft += shiftX * zoom;
      if (shiftY) wrap.scrollTop += shiftY * zoom;
    });
  };
  const ensureRoomForNode = (clientId, rawX, rawY) => {
    const block = boardRef.current?.querySelector(`[data-builder-node="${clientId}"]`);
    const blockWidth = block?.offsetWidth || 300;
    const blockHeight = block?.offsetHeight || 172;
    const margin = 180;
    let x = rawX;
    let y = rawY;
    const left = x < margin ? margin - x + 560 : 0;
    const top = y < margin ? margin - y + 420 : 0;
    if (left || top) {
      expandCanvas({ left, top });
      x += left;
      y += top;
    }
    const active = canvasSizeRef.current;
    const right = x + blockWidth + margin > active.width ? x + blockWidth + margin - active.width + 560 : 0;
    const bottom = y + blockHeight + margin > active.height ? y + blockHeight + margin - active.height + 420 : 0;
    if (right || bottom) expandCanvas({ right, bottom });
    return { x, y };
  };
  const startDrag = (event, section) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    dragRef.current = { id: section.clientId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: number(section.canvasX), y: number(section.canvasY) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || (drag.pointerId != null && event.pointerId !== drag.pointerId)) return false;
    event.preventDefault();
    const next = ensureRoomForNode(drag.id, drag.x + (event.clientX - drag.startX) / zoom, drag.y + (event.clientY - drag.startY) / zoom);
    updateSection(drag.id, "canvasX", Math.round(next.x));
    updateSection(drag.id, "canvasY", Math.round(next.y));
    return true;
  };
  const startPan = (event) => {
    if (event.button !== 0 || event.isPrimary === false || dragRef.current || event.target.closest(".tm-builder-block,button")) return;
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    event.preventDefault();
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: wrap.scrollLeft,
      startScrollTop: wrap.scrollTop,
    };
    wrap.classList.add("is-panning");
    wrap.setPointerCapture?.(event.pointerId);
  };
  const movePan = (event) => {
    const pan = panRef.current;
    const wrap = canvasWrapRef.current;
    if (!pan || !wrap || (pan.pointerId != null && event.pointerId !== pan.pointerId)) return false;
    event.preventDefault();
    let nextLeft = pan.startScrollLeft - (event.clientX - pan.startX);
    let nextTop = pan.startScrollTop - (event.clientY - pan.startY);
    const edge = 120;
    const scaledWidth = canvasSizeRef.current.width * zoom;
    const scaledHeight = canvasSizeRef.current.height * zoom;
    const maxLeft = Math.max(0, scaledWidth - wrap.clientWidth);
    const maxTop = Math.max(0, scaledHeight - wrap.clientHeight);
    const grow = {
      left: nextLeft < edge ? 700 : 0,
      top: nextTop < edge ? 520 : 0,
      right: nextLeft > maxLeft - edge ? 700 : 0,
      bottom: nextTop > maxTop - edge ? 520 : 0,
    };
    if (grow.left || grow.top || grow.right || grow.bottom) {
      expandCanvas(grow);
      pan.startScrollLeft += grow.left * zoom;
      pan.startScrollTop += grow.top * zoom;
      nextLeft = pan.startScrollLeft - (event.clientX - pan.startX);
      nextTop = pan.startScrollTop - (event.clientY - pan.startY);
    }
    wrap.scrollLeft = Math.max(0, nextLeft);
    wrap.scrollTop = Math.max(0, nextTop);
    return true;
  };
  const moveCanvas = (event) => { if (!moveDrag(event)) movePan(event); };
  const endCanvasGesture = (event) => {
    if (dragRef.current && (event?.pointerId == null || dragRef.current.pointerId === event.pointerId)) dragRef.current = null;
    if (panRef.current && (event?.pointerId == null || panRef.current.pointerId === event.pointerId)) {
      const wrap = canvasWrapRef.current;
      try { wrap?.releasePointerCapture?.(panRef.current.pointerId); } catch {}
      wrap?.classList.remove("is-panning");
      panRef.current = null;
    }
  };
  const save = async () => {
    setError("");
    const title = text(draft.title); const dueDate = dateKey(draft.dueDate);
    if (!title || !dueDate) return setError("Project title and target date are required.");
    if (!draft.sections.length) return setError("Add at least one workflow block.");
    if (draft.sections.some((section) => !text(section.department) || !text(section.request) || !dateKey(section.deliveryDate))) return setError("Each workflow block requires a department, requested action, and delivery date.");
    const edges = draft.sections.flatMap((section) => (section.dependsOn || []).map((from) => ({ from, to: section.clientId })));
    const labels = workflowNumbering(draft.sections, edges);
    const ordered = orderedWorkflowNodes(draft.sections, labels);
    const sections = ordered.map((section, index) => {
      const label = text(labels.get(text(section.clientId)));
      const executionGroup = Math.max(1, number(label.split('.')[0]) || index + 1);
      return { clientId: section.clientId, department: text(section.department), request: text(section.request), details: text(section.details), deliveryDate: dateKey(section.deliveryDate), attachments: section.attachments || [], sortOrder: index + 1, executionGroup, canvasX: Math.round(number(section.canvasX)), canvasY: Math.round(number(section.canvasY)) };
    });
    setBusy(true);
    try {
      const isEdit = !!draft.id;
      const payload = { title, description: text(draft.description), priority: text(draft.priority) || "Normal", dueDate, sections, edges, ...(isEdit ? { adminPassword: draft.adminPassword || "" } : {}) };
      const result = await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({ action: isEdit ? "ticket-update" : "ticket-create", view, ticketId: draft.id || "", ...payload }) });
      notify("success", isEdit ? "Project updated" : "Project created", isEdit ? "The project workflow changes were saved." : "The project workflow is ready and arrows now control the execution sequence.");
      onSaved(result.ticket);
    } catch (saveError) { setError(saveError?.message || "The project could not be saved."); }
    finally { setBusy(false); }
  };
  const activeBlock = draft.sections.find((section) => section.clientId === blockId) || null;
  const boardWidth = Math.max(canvasSize.width, 1280, ...draft.sections.map((s) => number(s.canvasX) + 390));
  const boardHeight = Math.max(canvasSize.height, 900, ...draft.sections.map((s) => number(s.canvasY) + 290));
  canvasSizeRef.current = { width: Math.max(canvasSizeRef.current.width, boardWidth), height: Math.max(canvasSizeRef.current.height, boardHeight) };
  const edgeList = draft.sections.flatMap((section) => (section.dependsOn || []).map((from) => ({ from, to: section.clientId })));
  const blockLabels = workflowNumbering(draft.sections, edgeList);

  useLayoutEffect(() => {
    if (mode !== "builder") return;
    setAnchors(readBuilderSocketAnchors(boardRef.current, "horizontal"));
  }, [mode, draft.sections, zoom, boardWidth, boardHeight]);

  return <>
    {mode === "meta" ? <div className="tm-overlay tm-overlay--above" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={onClose} /><section className="tm-dialog tm-dialog--meta"><div className="tm-dialog__top"><div><span className="tm-eyebrow">Project details</span><h2>Project information</h2></div><button type="button" className="tm-icon-btn" onClick={onClose}><FeatherIcon name="x" /></button></div><form onSubmit={continueToBuilder}><div className="tm-form-grid"><label className="tm-field tm-field--wide"><span>Project title <b>*</b></span><input value={draft.title} onChange={(event) => update("title", event.target.value)} maxLength={500} required /></label><label className="tm-field"><span>Priority <b>*</b></span><ClassicTaskSelect kind="priority" value={draft.priority} onChange={(event) => update("priority", event.target.value)}>{PRIORITIES.map((item) => <option value={item} key={item}>{item}</option>)}</ClassicTaskSelect></label><label className="tm-field"><span>Target date <b>*</b></span><input type="date" value={draft.dueDate} onChange={(event) => update("dueDate", event.target.value)} required /></label><label className="tm-field tm-field--wide"><span>Description</span><textarea rows="4" value={draft.description} onChange={(event) => update("description", event.target.value)} /></label></div>{error ? <div className="tm-form-error">{error}</div> : null}<div className="tm-dialog__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Cancel</button><button type="submit" className="tm-btn tm-btn--primary"><span>{draft.id ? "Save Project Details" : "Continue to Workflow"}</span><FeatherIcon name="chevron-right" /></button></div></form></section></div> : null}

    {mode === "builder" ? <div className="tm-overlay tm-overlay--builder-layer" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={onClose} /><section className="tm-dialog tm-dialog--builder"><div className="tm-builder-header"><div><span className="tm-eyebrow">Workflow builder</span></div><button type="button" className="tm-icon-btn" onClick={onClose}><FeatherIcon name="x" /></button></div><div className="tm-builder-scroll-region"><div className="tm-builder-toolbar" role="toolbar"><div className="tm-builder-toolbar__tools"><button type="button" className="tm-builder-tool tm-builder-tool--primary" onClick={addSection}><FeatherIcon name="plus-square" /><span>Add Block</span></button><div className="tm-builder-zoom"><button type="button" className="tm-builder-tool tm-builder-tool--icon" onClick={() => setZoom((z) => Math.max(.4, +(z - .1).toFixed(1)))}><FeatherIcon name="minus" /></button><button type="button" className="tm-builder-zoom__label" onClick={() => setZoom(1)}><span>{Math.round(zoom * 100)}%</span></button><button type="button" className="tm-builder-tool tm-builder-tool--icon" onClick={() => setZoom((z) => Math.min(1.8, +(z + .1).toFixed(1)))}><FeatherIcon name="plus" /></button></div><button type="button" className="tm-builder-tool" onClick={() => setMode("meta")}><FeatherIcon name="file-text" /><span>Project Details</span></button></div><div className={`tm-builder-toolbar__status${connectFrom ? " is-connecting" : ""}`}>{connectFrom ? <><FeatherIcon name="git-branch" /><span>Select another block input point</span></> : <><span className="tm-builder-status__item"><FeatherIcon name="layers" /><strong>{draft.sections.length}</strong><span>Blocks</span></span><span className="tm-builder-status__divider" aria-hidden="true" /><span className="tm-builder-status__item"><FeatherIcon name="git-branch" /><strong>{edgeList.length}</strong><span>Connections</span></span></>}</div><div className="tm-builder-toolbar__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Cancel</button><button type="button" className="tm-btn tm-btn--primary" onClick={save} disabled={busy || !!uploading}><FeatherIcon name="save" /><span>{busy ? "Saving…" : draft.id ? "Save Changes" : "Create Project"}</span></button></div></div>
      <div ref={canvasWrapRef} className="tm-builder-canvas-wrap" onPointerDown={startPan} onPointerMove={moveCanvas} onPointerUp={endCanvasGesture} onPointerCancel={endCanvasGesture}>
        <div className="tm-builder-canvas-stage" style={{ width: boardWidth * zoom, height: boardHeight * zoom }}>
          <div ref={boardRef} className="tm-builder-board" style={{ width: boardWidth, height: boardHeight, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
            <svg className="tm-connection-layer" width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} aria-hidden="true"><defs><marker id="nextTmArrow" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" className="tm-arrow-marker" /></marker></defs>{edgeList.map((edge) => { const from = draft.sections.find((s) => s.clientId === edge.from); const to = draft.sections.find((s) => s.clientId === edge.to); if (!from || !to) return null; return <path key={`${edge.from}-${edge.to}`} className="tm-builder-arrow" markerEnd="url(#nextTmArrow)" d={builderArrowPath(edge.from, edge.to, anchors, from, to, "horizontal")} />; })}</svg>
            {draft.sections.map((section, index) => <article data-builder-node={section.clientId} className={`tm-builder-block${connectFrom === section.clientId ? " is-connect-source" : ""}`} style={{ left: number(section.canvasX), top: number(section.canvasY) }} key={section.clientId}><button type="button" className="tm-builder-socket tm-builder-socket--in" aria-label="Connect into block" onClick={() => toggleConnection(section.clientId)} /><div className="tm-builder-block__head" onPointerDown={(event) => startDrag(event, section)}><span className="tm-builder-block__number">{blockLabels.get(text(section.clientId)) || index + 1}</span><span className="tm-builder-block__title"><b>{section.department || "Department"}</b><small>{section.deliveryDate ? `Delivery ${formatDate(section.deliveryDate)}` : "Set delivery date"}</small></span><span className="tm-builder-block__actions"><button type="button" className="tm-builder-icon-btn" onClick={() => setBlockId(section.clientId)}><FeatherIcon name="edit" /></button><button type="button" className="tm-builder-icon-btn tm-builder-icon-btn--danger" onClick={() => removeSection(section.clientId)}><FeatherIcon name="trash" /></button></span></div><button type="button" className="tm-builder-block__body" onClick={() => setBlockId(section.clientId)}><span className="tm-builder-block__label">Requested action</span><strong>{section.request || "Click to add requested action"}</strong><span className={`tm-builder-block__details${section.details ? "" : " tm-builder-block__details--empty"}`}>{section.details || "No extra details"}</span></button><button type="button" className="tm-builder-socket tm-builder-socket--out" aria-label="Start connection" onClick={() => setConnectFrom(section.clientId)} /></article>)}
          </div>
        </div>
        {!builderStarted ? <div className="tm-builder-empty tm-builder-empty--viewport"><FeatherIcon name="git-branch" /><b>Your workflow canvas is ready</b><span>Use <strong>Add Block</strong> to create a department task, then click a block’s output point and another block’s input point to connect the execution path.</span></div> : null}
      </div><div className="tm-builder-legend"><span><i className="tm-legend-dot tm-legend-dot--ready" />Each block is one department section</span><span><i className="tm-legend-arrow">→</i>Click an output point, then an input point to create an arrow</span><span><i className="tm-legend-handle" />Press and drag any empty part of a block to move it</span></div>{error ? <div className="tm-form-error">{error}</div> : null}</div><div className="tm-builder-mobile-footer"><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Cancel</button><button type="button" className="tm-btn tm-btn--primary" onClick={save} disabled={busy || !!uploading}><FeatherIcon name="save" /><span>{busy ? "Saving…" : draft.id ? "Save Changes" : "Create Project"}</span></button></div></section></div> : null}

    {activeBlock ? <div className="tm-overlay tm-overlay--above" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={() => setBlockId("")} /><section className="tm-dialog tm-dialog--block"><div className="tm-dialog__top"><div><span className="tm-eyebrow">Workflow block</span><h2>Edit Block</h2></div><button type="button" className="tm-icon-btn" onClick={() => setBlockId("")}><FeatherIcon name="x" /></button></div><div className="tm-form-grid tm-form-grid--block"><label className="tm-field"><span>Responsible department <b>*</b></span><ClassicTaskSelect value={activeBlock.department} onChange={(event) => updateSection(activeBlock.clientId, "department", event.target.value)}><option value="">Select department</option>{(meta.departments || []).map((department) => <option value={department} key={department}>{department}</option>)}</ClassicTaskSelect></label><label className="tm-field"><span>Delivery date <b>*</b></span><input type="date" max={draft.dueDate || undefined} value={activeBlock.deliveryDate} onChange={(event) => updateSection(activeBlock.clientId, "deliveryDate", event.target.value)} /></label><label className="tm-field tm-field--wide"><span>Requested action <b>*</b></span><textarea rows="3" value={activeBlock.request} onChange={(event) => updateSection(activeBlock.clientId, "request", event.target.value)} /></label><label className="tm-field tm-field--wide"><span>Details</span><textarea rows="4" value={activeBlock.details} onChange={(event) => updateSection(activeBlock.clientId, "details", event.target.value)} /></label><div className="tm-field tm-field--wide"><span>Attachments</span><div className="tm-upload-field"><label className="tm-upload-field__picker"><input hidden type="file" multiple onChange={(event) => { chooseFiles(activeBlock.clientId, event.target.files); event.target.value = ""; }} /><span className="tm-upload-field__icon"><FeatherIcon name="upload" /></span><span className="tm-upload-field__copy"><b>{uploading === activeBlock.clientId ? "Uploading…" : "Upload files"}</b><small>Maximum 10 MB per file</small></span><span className="tm-upload-field__action">Choose files</span></label></div><AttachmentLinks attachments={activeBlock.attachments} onRemove={(index, file) => removeAttachment(activeBlock.clientId, index, file)} /></div></div><div className="tm-dialog__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={() => setBlockId("")}>Cancel</button><button type="button" className="tm-btn tm-btn--primary" onClick={() => setBlockId("")}><FeatherIcon name="save" /><span>Save Block</span></button></div></section></div> : null}
    <ActionLoadingModal state={actionLoading} />
  </>;
}

function WorkEditor({ target, view, onClose, onSaved, notify }) {
  const [form, setForm] = useState(() => ({
    status: target.status || "not_started",
    workReport: target.workReport || target.completionNote || "",
    rejectionReason: target.rejectionReason || "",
    workLink: target.workLink || "",
    workFiles: Array.isArray(target.workFiles) ? target.workFiles : (target.workFile ? [target.workFile] : []),
  }));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const choose = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadTaskFiles(files, view);
      setForm((current) => ({ ...current, workFiles: mergeAttachments(current.workFiles, uploaded) }));
    } catch (uploadError) {
      setError(uploadError?.message || "The work files could not be uploaded.");
    } finally { setUploading(false); }
  };
  const save = async (event) => {
    event.preventDefault();
    if (form.status === "rejected" && !text(form.rejectionReason)) return setError("Enter the rejected reason.");
    setBusy(true); setError("");
    try {
      const result = await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({ action: target.targetType === "assignment" ? "assignment-work" : "section-work", view: "my", ...(target.targetType === "assignment" ? { assignmentId: target.id } : { sectionId: target.id }), ...form }) });
      notify("success", "Task work updated", `${target.task || target.request || "Task"} was updated.`);
      onSaved(result);
    } catch (saveError) { setError(saveError?.message || "The task work could not be updated."); }
    finally { setBusy(false); }
  };
  const kicker = target.targetType === "assignment" ? "Team-member task" : "My department task";
  return <div className="tm-overlay tm-overlay--above" role="dialog" aria-modal="true">
    <div className="tm-overlay__backdrop" onClick={onClose} />
    <section className="tm-dialog tm-dialog--work-page">
      <div className="tm-dialog__top tm-work-page__header">
        <div><span className="tm-eyebrow">{kicker}</span><h2>Task work page</h2><p>Update the status, report, and work files for this section.</p></div>
        <button type="button" className="tm-icon-btn" aria-label="Close work page" onClick={onClose}><FeatherIcon name="x" /></button>
      </div>
      <form onSubmit={save} noValidate>
        <div className="tm-form-grid tm-work-page__form-grid">
          <label className="tm-field tm-field--wide"><span>Status <b>*</b></span><ClassicTaskSelect kind="status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>{WORK_STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</ClassicTaskSelect></label>
          {form.status === "rejected" ? <label className="tm-field tm-field--wide"><span>Rejected reason <b>*</b></span><textarea rows="3" value={form.rejectionReason} onChange={(event) => setForm((current) => ({ ...current, rejectionReason: event.target.value }))} placeholder="Write why this task is rejected." /></label> : null}
          <label className="tm-field tm-field--wide"><span>Work report</span><textarea rows="5" maxLength={12000} value={form.workReport} onChange={(event) => setForm((current) => ({ ...current, workReport: event.target.value }))} placeholder="Write the work completed, progress, blockers, or handover details." /></label>
          <div className="tm-field tm-field--wide"><span>Work file</span><div className="tm-upload-field"><label className="tm-upload-field__picker"><input className="tm-upload-field__input" hidden type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={(event) => { choose(event.target.files); event.target.value = ""; }} /><span className="tm-upload-field__icon"><FeatherIcon name="upload" /></span><span className="tm-upload-field__copy"><b>{uploading ? "Uploading work file…" : "Upload work file"}</b><small>Images, PDF, Office files, text, CSV, or ZIP · maximum 10 MB</small></span><span className="tm-upload-field__action">Choose file</span></label>{form.workFiles.length ? <div className="tm-work-files-parity"><AttachmentLinks attachments={form.workFiles} /><button type="button" className="tm-btn tm-btn--secondary tm-work-files-clear" onClick={() => setForm((current) => ({ ...current, workFiles: [] }))}>Remove files</button></div> : null}</div></div>
          <label className="tm-field tm-field--wide"><span>Work link</span><div className="tm-link-control"><FeatherIcon name="link" /><input type="url" maxLength={4000} placeholder="https://drive.google.com/... or another work link" value={form.workLink} onChange={(event) => setForm((current) => ({ ...current, workLink: event.target.value }))} /></div></label>
        </div>
        {error ? <div className="tm-form-error" role="alert">{error}</div> : null}
        <div className="tm-dialog__actions tm-work-page__actions"><span className="tm-dialog__actions-spacer" /><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Close</button><button type="submit" className="tm-btn tm-btn--primary" disabled={busy || uploading}><FeatherIcon name="save" /><span>{busy ? "Saving…" : "Save Work"}</span></button></div>
      </form>
    </section>
  </div>;
}

function TeamWorkflowModal({ section, meta, onClose, onWork, notify, onParentRefresh }) {
  const [workflow, setWorkflow] = useState(null);
  const [draft, setDraft] = useState([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const { actionLoading, startActionLoading, finishActionLoading } = useActionLoading();
  const [blockId, setBlockId] = useState("");
  const [connectFrom, setConnectFrom] = useState("");
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 900 });
  const [anchors, setAnchors] = useState({});
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const boardRef = useRef(null);
  const canvasSizeRef = useRef({ width: 1280, height: 900 });
  const canManage = ["edit", "admin"].includes(lower(meta.accessLevel)) || meta.isPageAdmin;
  const currentUser = meta.currentUser || {};

  const load = async () => {
    setBusy(true); setError("");
    try {
      const result = await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({ action: "people-workflow-get", view: "my", sectionId: section.id }) });
      const items = (result.assignments || []).map((assignment, index) => ({
        ...assignment,
        clientId: text(assignment.id) || newClientId("assignment"),
        dependsOn: dependenciesFor(result.assignments || [], result.edges || [], assignment.id),
        canvasX: Number.isFinite(Number(assignment.canvasX)) ? Number(assignment.canvasX) : 160,
        canvasY: Number.isFinite(Number(assignment.canvasY)) ? Number(assignment.canvasY) : 80 + index * 210,
      }));
      setWorkflow(result); setDraft(items);
    } catch (loadError) { setError(loadError?.message || "The team workflow could not be loaded."); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [section.id]);
  const update = (clientId, key, value) => setDraft((current) => current.map((item) => item.clientId === clientId ? { ...item, [key]: value } : item));
  const add = () => {
    const id = newClientId("assignment");
    setDraft((current) => {
      const previous = current[current.length - 1];
      const wrap = canvasWrapRef.current;
      const centerX = wrap ? (wrap.scrollLeft + (wrap.clientWidth / 2)) / zoom : 640;
      const centerY = wrap ? (wrap.scrollTop + (wrap.clientHeight / 2)) / zoom : 360;
      return [...current, {
        clientId: id, assigneeId: "", assigneeName: "", task: "", details: "",
        deliveryDate: section.deliveryDate || "", attachments: [], dependsOn: previous ? [previous.clientId] : [], status: "not_started",
        canvasX: Math.max(70, Math.round(centerX - 150)),
        canvasY: Math.max(80, Math.round(centerY - 86 + current.length * 190)),
      }];
    });
    setBlockId(id);
  };
  const remove = (clientId) => setDraft((current) => current.filter((item) => item.clientId !== clientId).map((item) => ({ ...item, dependsOn: (item.dependsOn || []).filter((id) => id !== clientId) })));
  const chooseFiles = async (clientId, files) => {
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!selectedFiles.length) return;
    setUploading(clientId); setError("");
    startActionLoading({
      title: "Uploading files",
      message: `Uploading ${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} to this team task…`,
    });
    try {
      const uploaded = await uploadTaskFiles(selectedFiles, "my");
      setDraft((current) => current.map((item) => item.clientId === clientId
        ? { ...item, attachments: mergeAttachments(item.attachments, uploaded) }
        : item));
      await finishActionLoading("done", `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} uploaded successfully.`);
    } catch (uploadError) {
      const message = uploadError?.message || "The attachments could not be uploaded.";
      setError(message);
      await finishActionLoading("failed", message);
    } finally { setUploading(""); }
  };
  const removeAttachment = (clientId, index, file) => {
    setDraft((current) => current.map((item) => item.clientId === clientId
      ? { ...item, attachments: (Array.isArray(item.attachments) ? item.attachments : []).filter((attachment, fileIndex) => file?.url ? text(attachment?.url) !== text(file.url) : fileIndex !== index) }
      : item));
  };
  const save = async () => {
    if (!draft.length) return setError("Add at least one team-member task.");
    if (draft.some((item) => !text(item.assigneeId) || !text(item.task) || !dateKey(item.deliveryDate))) return setError("Each task requires a team member, task, and delivery date.");
    setSaving(true); setError("");
    try {
      const edges = draft.flatMap((item) => (item.dependsOn || []).map((from) => ({ from, to: item.clientId })));
      const labels = workflowNumbering(draft, edges);
      const ordered = orderedWorkflowNodes(draft, labels);
      const assignments = ordered.map((item, index) => {
        const label = text(labels.get(text(item.clientId)));
        const executionGroup = Math.max(1, number(label.split('.')[0]) || index + 1);
        return {
          clientId: item.clientId, assigneeId: item.assigneeId, assigneeName: item.assigneeName,
          task: item.task, details: item.details, deliveryDate: dateKey(item.deliveryDate), attachments: item.attachments || [],
          sortOrder: index + 1, executionGroup, canvasX: Math.round(number(item.canvasX)), canvasY: Math.round(number(item.canvasY)),
        };
      });
      const result = await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({ action: "people-workflow-save", view: "my", sectionId: section.id, assignments, edges }) });
      notify("success", "Team workflow saved", `${assignments.length} team task${assignments.length === 1 ? "" : "s"} saved.`);
      setWorkflow((current) => ({ ...(current || {}), ...result }));
      setDraft((result.assignments || []).map((assignment, index) => ({
        ...assignment, clientId: text(assignment.id), dependsOn: dependenciesFor(result.assignments || [], result.edges || [], assignment.id),
        canvasX: Number.isFinite(Number(assignment.canvasX)) ? Number(assignment.canvasX) : 160,
        canvasY: Number.isFinite(Number(assignment.canvasY)) ? Number(assignment.canvasY) : 80 + index * 210,
      })));
      onParentRefresh();
    } catch (saveError) { setError(saveError?.message || "The team workflow could not be saved."); }
    finally { setSaving(false); }
  };
  const archiveAssignment = async (assignment) => {
    const archived = assignment.status !== "cancelled";
    try {
      const result = await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({ action: "assignment-archive", view: "my", assignmentId: assignment.id, archived }) });
      notify("success", archived ? "Task archived" : "Task restored", assignment.assigneeName || "Team task");
      setDraft((current) => current.map((item) => item.clientId === assignment.clientId ? { ...item, ...result.assignment } : item));
      onParentRefresh();
    } catch (actionError) { notify("error", "Action failed", actionError?.message || "The team task could not be updated."); }
  };
  const deleteAssignment = async (assignment) => {
    if (!window.confirm(`Delete the task assigned to ${assignment.assigneeName || "this team member"}?`)) return;
    try {
      await requestJson("/next/api/task-management/mutations-direct", { method: "POST", body: JSON.stringify({ action: "assignment-delete", view: "my", assignmentId: assignment.id }) });
      remove(assignment.clientId); notify("success", "Task deleted", assignment.assigneeName || "Team task"); onParentRefresh();
    } catch (actionError) { notify("error", "Delete failed", actionError?.message || "The team task could not be deleted."); }
  };
  const ownAssignment = (assignment) => {
    if (text(assignment.assigneeId) && text(currentUser.id)) return text(assignment.assigneeId) === text(currentUser.id);
    return lower(assignment.assigneeName) === lower(currentUser.name);
  };
  const toggleConnection = (toId) => {
    if (!connectFrom || connectFrom === toId) return setConnectFrom("");
    setDraft((current) => current.map((item) => item.clientId === toId ? { ...item, dependsOn: (item.dependsOn || []).includes(connectFrom) ? (item.dependsOn || []).filter((id) => id !== connectFrom) : [...(item.dependsOn || []), connectFrom] } : item));
    setConnectFrom("");
  };
  const expandCanvas = ({ left = 0, top = 0, right = 0, bottom = 0 } = {}) => {
    const shiftX = Math.max(0, Math.ceil(number(left)));
    const shiftY = Math.max(0, Math.ceil(number(top)));
    const growRight = Math.max(0, Math.ceil(number(right)));
    const growBottom = Math.max(0, Math.ceil(number(bottom)));
    if (!(shiftX || shiftY || growRight || growBottom)) return;
    const currentSize = canvasSizeRef.current;
    const nextSize = {
      width: Math.max(1280, currentSize.width + shiftX + growRight),
      height: Math.max(900, currentSize.height + shiftY + growBottom),
    };
    canvasSizeRef.current = nextSize;
    setCanvasSize(nextSize);
    if (shiftX || shiftY) {
      setDraft((current) => current.map((item) => ({
        ...item,
        canvasX: number(item.canvasX) + shiftX,
        canvasY: number(item.canvasY) + shiftY,
      })));
      if (dragRef.current) {
        dragRef.current.x += shiftX;
        dragRef.current.y += shiftY;
      }
    }
    window.requestAnimationFrame(() => {
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      if (shiftX) wrap.scrollLeft += shiftX * zoom;
      if (shiftY) wrap.scrollTop += shiftY * zoom;
    });
  };
  const ensureRoomForNode = (clientId, rawX, rawY) => {
    const block = boardRef.current?.querySelector(`[data-builder-node="${clientId}"]`);
    const blockWidth = block?.offsetWidth || 300;
    const blockHeight = block?.offsetHeight || 172;
    const margin = 180;
    let x = rawX;
    let y = rawY;
    const left = x < margin ? margin - x + 560 : 0;
    const top = y < margin ? margin - y + 420 : 0;
    if (left || top) {
      expandCanvas({ left, top });
      x += left;
      y += top;
    }
    const active = canvasSizeRef.current;
    const right = x + blockWidth + margin > active.width ? x + blockWidth + margin - active.width + 560 : 0;
    const bottom = y + blockHeight + margin > active.height ? y + blockHeight + margin - active.height + 420 : 0;
    if (right || bottom) expandCanvas({ right, bottom });
    return { x, y };
  };
  const startDrag = (event, item) => {
    if (!canManage || event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    dragRef.current = { id: item.clientId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: number(item.canvasX), y: number(item.canvasY) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || (drag.pointerId != null && event.pointerId !== drag.pointerId)) return false;
    event.preventDefault();
    const next = ensureRoomForNode(drag.id, drag.x + (event.clientX - drag.startX) / zoom, drag.y + (event.clientY - drag.startY) / zoom);
    update(drag.id, "canvasX", Math.round(next.x));
    update(drag.id, "canvasY", Math.round(next.y));
    return true;
  };
  const startPan = (event) => {
    if (event.button !== 0 || event.isPrimary === false || dragRef.current || event.target.closest(".tm-builder-block,button")) return;
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    event.preventDefault();
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: wrap.scrollLeft,
      startScrollTop: wrap.scrollTop,
    };
    wrap.classList.add("is-panning");
    wrap.setPointerCapture?.(event.pointerId);
  };
  const movePan = (event) => {
    const pan = panRef.current;
    const wrap = canvasWrapRef.current;
    if (!pan || !wrap || (pan.pointerId != null && event.pointerId !== pan.pointerId)) return false;
    event.preventDefault();
    let nextLeft = pan.startScrollLeft - (event.clientX - pan.startX);
    let nextTop = pan.startScrollTop - (event.clientY - pan.startY);
    const edge = 120;
    const scaledWidth = canvasSizeRef.current.width * zoom;
    const scaledHeight = canvasSizeRef.current.height * zoom;
    const maxLeft = Math.max(0, scaledWidth - wrap.clientWidth);
    const maxTop = Math.max(0, scaledHeight - wrap.clientHeight);
    const grow = {
      left: nextLeft < edge ? 700 : 0,
      top: nextTop < edge ? 520 : 0,
      right: nextLeft > maxLeft - edge ? 700 : 0,
      bottom: nextTop > maxTop - edge ? 520 : 0,
    };
    if (grow.left || grow.top || grow.right || grow.bottom) {
      expandCanvas(grow);
      pan.startScrollLeft += grow.left * zoom;
      pan.startScrollTop += grow.top * zoom;
      nextLeft = pan.startScrollLeft - (event.clientX - pan.startX);
      nextTop = pan.startScrollTop - (event.clientY - pan.startY);
    }
    wrap.scrollLeft = Math.max(0, nextLeft);
    wrap.scrollTop = Math.max(0, nextTop);
    return true;
  };
  const moveCanvas = (event) => { if (!moveDrag(event)) movePan(event); };
  const endCanvasGesture = (event) => {
    if (dragRef.current && (event?.pointerId == null || dragRef.current.pointerId === event.pointerId)) dragRef.current = null;
    if (panRef.current && (event?.pointerId == null || panRef.current.pointerId === event.pointerId)) {
      const wrap = canvasWrapRef.current;
      try { wrap?.releasePointerCapture?.(panRef.current.pointerId); } catch {}
      wrap?.classList.remove("is-panning");
      panRef.current = null;
    }
  };
  const activeBlock = draft.find((item) => item.clientId === blockId) || null;
  const boardWidth = Math.max(canvasSize.width, 1280, ...draft.map((item) => number(item.canvasX) + 390));
  const boardHeight = Math.max(canvasSize.height, 900, ...draft.map((item) => number(item.canvasY) + 290));
  canvasSizeRef.current = { width: Math.max(canvasSizeRef.current.width, boardWidth), height: Math.max(canvasSizeRef.current.height, boardHeight) };
  const edges = draft.flatMap((item) => (item.dependsOn || []).map((from) => ({ from, to: item.clientId })));
  const blockLabels = workflowNumbering(draft, edges);

  useLayoutEffect(() => {
    if (busy || !workflow) return;
    setAnchors(readBuilderSocketAnchors(boardRef.current, "vertical"));
  }, [busy, workflow, draft, zoom, boardWidth, boardHeight]);

  return <>
    <div className="tm-overlay tm-overlay--builder-layer is-people-mode" role="dialog" aria-modal="true">
      <div className="tm-overlay__backdrop" onClick={onClose} />
      <section className="tm-dialog tm-dialog--builder">
        <div className="tm-builder-header"><div><span className="tm-eyebrow">Workflow builder</span><h2>Team Task Workflow</h2></div><button type="button" className="tm-icon-btn" aria-label="Close workflow builder" onClick={onClose}><FeatherIcon name="x" /></button></div>
        <div className="tm-builder-toolbar" role="toolbar" aria-label="Workflow builder tools">
          <div className="tm-builder-toolbar__tools">
            {canManage ? <button type="button" className="tm-builder-tool tm-builder-tool--primary" onClick={add}><FeatherIcon name="plus-square" /><span>Add Person Task</span></button> : null}
            <div className="tm-builder-zoom" role="group" aria-label="Canvas zoom controls"><button type="button" className="tm-builder-tool tm-builder-tool--icon" onClick={() => setZoom((value) => Math.max(.5, +(value - .1).toFixed(1)))} aria-label="Zoom out"><FeatherIcon name="minus" /></button><button type="button" className="tm-builder-zoom__label" onClick={() => setZoom(1)}><span>{Math.round(zoom * 100)}%</span></button><button type="button" className="tm-builder-tool tm-builder-tool--icon" onClick={() => setZoom((value) => Math.min(1.8, +(value + .1).toFixed(1)))} aria-label="Zoom in"><FeatherIcon name="plus" /></button></div>
          </div>
          <div className="tm-builder-toolbar__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Cancel</button>{canManage ? <button type="button" className="tm-btn tm-btn--primary" onClick={save} disabled={saving || !!uploading}><FeatherIcon name="save" /><span>{saving ? "Saving…" : "Save Team Workflow"}</span></button> : null}</div>
        </div>
        {busy ? <div className="tm-builder-loading">Loading team workflow…</div> : null}
        {!busy && error && !workflow ? <div className="next-task-error-box"><b>Could not load team workflow</b><p>{error}</p><button type="button" onClick={load}>Retry</button></div> : null}
        {!busy && workflow ? <div ref={canvasWrapRef} className="tm-builder-canvas-wrap" onPointerDown={startPan} onPointerMove={moveCanvas} onPointerUp={endCanvasGesture} onPointerCancel={endCanvasGesture}>
          <div className="tm-builder-canvas-stage" style={{ width: boardWidth * zoom, height: boardHeight * zoom }}>
            <div ref={boardRef} className={`tm-builder-board is-people-mode${connectFrom ? " is-awaiting-target" : ""}`} style={{ width: boardWidth, height: boardHeight, transform: `scale(${zoom})`, transformOrigin: "0 0" }} aria-label="Team task workflow design canvas">
              <svg className="tm-connection-layer" width={boardWidth} height={boardHeight} viewBox={`0 0 ${boardWidth} ${boardHeight}`} aria-hidden="true"><defs><marker id="nextPeopleArrow" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" className="tm-arrow-marker" /></marker></defs>{edges.map((edge, index) => { const from = draft.find((item) => item.clientId === edge.from); const to = draft.find((item) => item.clientId === edge.to); if (!from || !to) return null; return <path key={`${edge.from}-${edge.to}-${index}`} className="tm-builder-arrow" markerEnd="url(#nextPeopleArrow)" d={builderArrowPath(edge.from, edge.to, anchors, from, to, "vertical")} />; })}</svg>
              {draft.map((assignment, index) => <article data-builder-node={assignment.clientId} className={`tm-builder-block${connectFrom === assignment.clientId ? " is-connect-source" : ""}${assignment.status === "cancelled" ? " is-archived" : ""}`} style={{ left: number(assignment.canvasX), top: number(assignment.canvasY) }} key={assignment.clientId}>
                {canManage ? <button type="button" className="tm-builder-socket tm-builder-socket--top" aria-label="Connect into task" onClick={() => toggleConnection(assignment.clientId)} /> : null}
                <div className="tm-builder-block__head" onPointerDown={(event) => startDrag(event, assignment)}><span className="tm-builder-block__number">{blockLabels.get(text(assignment.clientId)) || index + 1}</span><span className="tm-builder-block__title"><b>{assignment.assigneeName || "Team member"}</b><small>{assignment.deliveryDate ? `Delivery ${formatDate(assignment.deliveryDate)}` : "Set delivery date"}</small></span><span className="tm-builder-block__actions">{canManage ? <button type="button" className="tm-builder-icon-btn" onClick={() => setBlockId(assignment.clientId)}><FeatherIcon name="edit" /></button> : null}{canManage && !assignment.id ? <button type="button" className="tm-builder-icon-btn tm-builder-icon-btn--danger" onClick={() => remove(assignment.clientId)}><FeatherIcon name="trash" /></button> : null}</span></div>
                <button type="button" className="tm-builder-block__body" onClick={() => canManage ? setBlockId(assignment.clientId) : ((ownAssignment(assignment) || meta.isPageAdmin) && assignment.status !== "cancelled" ? onWork({ ...assignment, targetType: "assignment" }) : null)}><span className="tm-builder-block__label">Assigned task</span><strong>{assignment.task || "Click to add assigned task"}</strong><span className={`tm-builder-block__details${assignment.details ? "" : " tm-builder-block__details--empty"}`}>{assignment.details || "No extra details"}</span></button>
                <div className="tm-people-block__status"><StatusPill status={assignment.status} archived={assignment.status === "cancelled"} /></div>
                {canManage ? <button type="button" className="tm-builder-socket tm-builder-socket--bottom" aria-label="Start connection" onClick={() => setConnectFrom(assignment.clientId)} /> : null}
              </article>)}
            </div>
          </div>
          {!draft.length ? <div className="tm-builder-empty tm-builder-empty--viewport"><FeatherIcon name="git-branch" /><b>Your team workflow canvas is ready</b><span>Add person tasks vertically, then connect each card from its bottom point to the next card’s top point.</span></div> : null}
        </div> : null}
        {!busy && workflow ? <div className="tm-builder-legend"><span><i className="tm-legend-dot tm-legend-dot--ready" />Each block is one team-member task</span><span><i className="tm-legend-arrow">↓</i>Click a bottom point, then a top point to connect the execution path</span><span><i className="tm-legend-handle" />Press and drag any empty part of a block to move it</span></div> : null}
        {error && workflow ? <div className="tm-form-error">{error}</div> : null}
      </section>
    </div>
    {activeBlock ? <div className="tm-overlay tm-overlay--above tm-overlay--builder-child" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={() => setBlockId("")} /><section className="tm-dialog tm-dialog--block"><div className="tm-dialog__top"><div><span className="tm-eyebrow">Person task</span><h2>Edit Block</h2></div><button type="button" className="tm-icon-btn" onClick={() => setBlockId("")}><FeatherIcon name="x" /></button></div>
      <div className="tm-form-grid tm-form-grid--block">
        <label className="tm-field"><span>Responsible team member <b>*</b></span><ClassicTaskSelect value={activeBlock.assigneeId || ""} onChange={(event) => { const member = (workflow?.members || []).find((item) => text(item.id) === event.target.value); update(activeBlock.clientId, "assigneeId", event.target.value); update(activeBlock.clientId, "assigneeName", member?.name || ""); }}><option value="">Select team member</option>{(workflow?.members || []).map((member) => <option value={member.id} key={member.id}>{member.name}{member.position ? ` · ${member.position}` : ""}</option>)}</ClassicTaskSelect></label>
        <label className="tm-field"><span>Delivery date <b>*</b></span><input type="date" max={section.deliveryDate || undefined} value={activeBlock.deliveryDate || ""} onChange={(event) => update(activeBlock.clientId, "deliveryDate", event.target.value)} /></label>
        <label className="tm-field tm-field--wide"><span>Assigned task <b>*</b></span><input maxLength={4000} value={activeBlock.task || ""} onChange={(event) => update(activeBlock.clientId, "task", event.target.value)} placeholder="What should this team member deliver?" /></label>
        <label className="tm-field tm-field--wide"><span>Implementation details</span><textarea rows="4" maxLength={8000} value={activeBlock.details || ""} onChange={(event) => update(activeBlock.clientId, "details", event.target.value)} placeholder="Optional notes, dependencies, or handover criteria." /></label>
        <div className="tm-field tm-field--wide"><span>Attachment</span><div className="tm-upload-field"><label className="tm-upload-field__picker"><input hidden type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" onChange={(event) => { chooseFiles(activeBlock.clientId, event.target.files); event.target.value = ""; }} /><span className="tm-upload-field__icon"><FeatherIcon name="upload" /></span><span className="tm-upload-field__copy"><b>{uploading === activeBlock.clientId ? "Uploading attachments…" : "Upload attachments"}</b><small>Select multiple files · maximum 10 MB per file</small></span><span className="tm-upload-field__action">Choose files</span></label></div><AttachmentLinks attachments={activeBlock.attachments} onRemove={(index, file) => removeAttachment(activeBlock.clientId, index, file)} /></div>
      </div>
      {(activeBlock.workReport || activeBlock.workLink || activeBlock.workFiles?.length || activeBlock.rejectionReason) ? <div className="tm-people-work-preview"><span>Submitted work</span>{activeBlock.workReport ? <p>{activeBlock.workReport}</p> : null}{activeBlock.rejectionReason ? <p className="danger">Rejected: {activeBlock.rejectionReason}</p> : null}{activeBlock.workLink ? <a href={activeBlock.workLink} target="_blank" rel="noreferrer">Open work link ↗</a> : null}<AttachmentLinks attachments={activeBlock.workFiles} /></div> : null}
      <div className="tm-dialog__actions">{activeBlock.id ? <><button type="button" className="tm-btn tm-btn--secondary" onClick={() => archiveAssignment(activeBlock)}>{activeBlock.status === "cancelled" ? "Restore" : "Archive"}</button><button type="button" className="tm-btn tm-btn--secondary tm-btn--danger" onClick={() => deleteAssignment(activeBlock)}>Delete</button></> : null}<span className="tm-dialog__actions-spacer" /><button type="button" className="tm-btn tm-btn--secondary" onClick={() => setBlockId("")}>Cancel</button><button type="button" className="tm-btn tm-btn--primary" onClick={() => setBlockId("")}><FeatherIcon name="save" /><span>Save Block</span></button></div>
    </section></div> : null}
    <ActionLoadingModal state={actionLoading} />
  </>;
}


function AdminActionModal({ action, ticket, view, onClose, onVerified }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!action || !ticket) return null;
  const label = action === "delete" ? "Delete project" : action === "archive" ? (ticket.isArchived ? "Restore project" : "Archive project") : "Edit project workflow";
  const submit = async (event) => {
    event.preventDefault();
    if (!text(password)) return setError("Enter the admin password.");
    setBusy(true); setError("");
    try {
      await requestJson("/next/api/task-management/admin/verify", { method: "POST", body: JSON.stringify({ view, adminPassword: password }) });
      onVerified(password);
    } catch (verifyError) { setError(verifyError?.message || "Invalid admin password."); }
    finally { setBusy(false); }
  };
  return <div className="tm-overlay tm-overlay--above" role="dialog" aria-modal="true">
    <div className="tm-overlay__backdrop" onClick={onClose} />
    <section className="tm-dialog tm-dialog--admin">
      <div className="tm-dialog__top"><div><span className="tm-eyebrow">Admin verification</span><h2>{label}</h2><p>Enter the admin password to continue.</p></div><button type="button" className="tm-icon-btn" onClick={onClose} aria-label="Close"><FeatherIcon name="x" /></button></div>
      <form onSubmit={submit}><label className="tm-field tm-field--wide"><span>Admin password <b>*</b></span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus placeholder="Enter admin password" /></label>{error ? <div className="tm-form-error">{error}</div> : null}<div className="tm-dialog__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={onClose}>Cancel</button><button type="submit" className="tm-btn tm-btn--primary" disabled={busy}><FeatherIcon name="save" /><span>{busy ? "Verifying…" : "Verify & Continue"}</span></button></div></form>
    </section>
  </div>;
}

function ProjectConfirmModal({ confirmAction, onCancel, onConfirm }) {
  if (!confirmAction?.ticket) return null;
  const { type, ticket } = confirmAction;
  const restoring = type === "archive" && !!ticket.isArchived;
  const deleting = type === "delete";
  const title = deleting ? "Delete project?" : (restoring ? "Restore project?" : "Archive project?");
  const message = deleting
    ? `“${ticket.title || ticket.ticketCode || "This project"}” will be permanently deleted with its workflow blocks, arrows, team assignments, reports, and files.`
    : restoring
      ? `“${ticket.title || ticket.ticketCode || "This project"}” will be restored and visible again to the users who normally have access to it.`
      : `“${ticket.title || ticket.ticketCode || "This project"}” will be hidden from everyone and kept only in your Archive tab on this Task Management page.`;
  return <div className="tm-overlay tm-overlay--top" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={onCancel} /><section className="tm-dialog tm-dialog--archive-confirm">
    <div className="tm-archive-confirm__icon"><FeatherIcon name={deleting ? "trash" : "archive"} /></div>
    <h2>{title}</h2><p>{message}</p>
    <div className="tm-archive-confirm__actions"><button type="button" className="tm-btn tm-btn--secondary" onClick={onCancel}>{deleting ? "No, keep it" : "No, keep it"}</button><button type="button" className={`tm-btn ${deleting ? "tm-btn--danger" : "tm-btn--archive"}`} onClick={onConfirm}><FeatherIcon name={deleting ? "trash" : "archive"} /><span>{deleting ? "Yes, Delete!" : restoring ? "Yes, Restore" : "Yes, Archive"}</span></button></div>
  </section></div>;
}

function RejectedInfoModal({ reason, onClose }) {
  if (!reason) return null;
  return <div className="tm-overlay tm-overlay--top" role="dialog" aria-modal="true"><div className="tm-overlay__backdrop" onClick={onClose} /><section className="tm-dialog tm-dialog--rejected-info"><div className="tm-dialog__top"><div><span className="tm-eyebrow">Rejected task</span><h2>Rejected reason</h2></div><button type="button" className="tm-icon-btn" onClick={onClose}><FeatherIcon name="x" /></button></div><div className="tm-rejected-info__message">{reason}</div><div className="tm-dialog__actions"><button type="button" className="tm-btn tm-btn--primary" onClick={onClose}>Close</button></div></section></div>;
}

export default function TaskManagementDialogs({
  editor, meta, view, onEditorClose, onSaved, notify,
  workTarget, onWorkClose, onWorkSaved,
  teamSection, onTeamClose, onTeamWork, onParentRefresh,
  adminAction, onAdminClose, onAdminVerified,
  confirmAction, onConfirmCancel, onConfirm,
  rejectedReason, onRejectedClose,
}) {
  return <>
    {editor ? <ProjectEditor editor={editor} meta={meta} view={view} onClose={onEditorClose} onSaved={onSaved} notify={notify} /> : null}
    {workTarget ? <WorkEditor target={workTarget} view={view} onClose={onWorkClose} onSaved={onWorkSaved} notify={notify} /> : null}
    {teamSection ? <TeamWorkflowModal section={teamSection} meta={meta} onClose={onTeamClose} onWork={onTeamWork} notify={notify} onParentRefresh={onParentRefresh} /> : null}
    {adminAction ? <AdminActionModal action={adminAction.action} ticket={adminAction.ticket} view={view} onClose={onAdminClose} onVerified={onAdminVerified} /> : null}
    {confirmAction ? <ProjectConfirmModal confirmAction={confirmAction} onCancel={onConfirmCancel} onConfirm={onConfirm} /> : null}
    {rejectedReason ? <RejectedInfoModal reason={rejectedReason} onClose={onRejectedClose} /> : null}
  </>;
}

