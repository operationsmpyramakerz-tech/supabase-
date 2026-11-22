"use client";

import HeaderFolderBreadcrumb from "../HeaderFolderBreadcrumb";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import SaveProgressModal, { useSaveProgress } from "../SaveProgressModal";
import ActionLoadingModal, { useActionLoading } from "../ActionLoadingModal";
import { confirmDelete } from "../../lib/client-confirm";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import { removeSourceKitFromDraft } from "../../lib/proposal-source-kit-management.mjs";
import { cartProductResource } from "../../lib/shopping-cart-product-resource.mjs";

const NameModal = dynamic(() => import("./ProposalDialogs").then((module) => module.NameModal), { ssr: false });
const PasswordModal = dynamic(() => import("./ProposalDialogs").then((module) => module.PasswordModal), { ssr: false });
const ProposalFolderNameModal = dynamic(() => import("../kits/KitDialogs").then((module) => module.FolderNameModal), { ssr: false });
const MoveProposalModal = dynamic(() => import("./ProposalFoldersDialogs").then((module) => module.MoveProposalModal), { ssr: false });
const BulkProposalEditModal = dynamic(() => import("./ProposalFoldersDialogs").then((module) => module.BulkProposalEditModal), { ssr: false });
const AddItemsModal = dynamic(() => import("./ProposalDialogs").then((module) => module.AddItemsModal), { ssr: false });
const ProposalDownloadModal = dynamic(() => import("./ProposalDialogs").then((module) => module.ProposalDownloadModal), { ssr: false });
const MakeOrderModal = dynamic(() => import("./ProposalDialogs").then((module) => module.MakeOrderModal), { ssr: false });
const ProposalSourceKitsModal = dynamic(() => import("./ProposalSourceKitsModal"), { ssr: false });

const EXPORT_COLUMNS = [
  ["idCode", "ID Code"],
  ["name", "Component"],
  ["quantity", "Quantity"],
  ["unitPrice", "Unit Cost"],
  ["totalPrice", "Total Cost"],
];

const COMBINE_LOGICS = [
  { value: "add", label: "Add", description: "Add quantities for components that appear in more than one proposal." },
  { value: "max", label: "Max", description: "Keep the highest quantity found for each repeated component." },
  { value: "min", label: "Min", description: "Keep the lowest quantity found where that component exists." },
  { value: "separate", label: "Separate", description: "Keep each proposal quantity visible separately in the combined export." },
];

const PROPOSAL_ICON_PATHS = {
  move: [<path key="p1" d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" />],
  arrowLeft: [<line key="l" x1="19" y1="12" x2="5" y2="12" />,<polyline key="p" points="12 19 5 12 12 5" />],

  download: [<path key="p1" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />, <polyline key="p2" points="7 10 12 15 17 10" />, <line key="l" x1="12" y1="15" x2="12" y2="3" />],
  externalLink: [<path key="p1" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />, <polyline key="p2" points="15 3 21 3 21 9" />, <line key="l" x1="10" y1="14" x2="21" y2="3" />],
  shoppingBag: [<path key="p1" d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />, <line key="l" x1="3" y1="6" x2="21" y2="6" />, <path key="p2" d="M16 10a4 4 0 0 1-8 0" />],
  folder: [<path key="p" d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />],
  folderPlus: [<path key="p1" d="M3 5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />, <path key="p2" d="M12 10v6M9 13h6" />],
  archive: [<polyline key="p1" points="21 8 21 21 3 21 3 8" />, <rect key="r" x="1" y="3" width="22" height="5" rx="1" />, <line key="l" x1="10" y1="12" x2="14" y2="12" />],
  edit: [<path key="p1" d="M12 20h9" />, <path key="p2" d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />],
  copy: [<rect key="r" x="9" y="9" width="13" height="13" rx="2" ry="2" />, <path key="p" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />],
  trash: [<polyline key="pl" points="3 6 5 6 21 6" />, <path key="p1" d="M19 6l-1 14H6L5 6" />, <path key="p2" d="M10 11v6M14 11v6M9 6V4h6v2" />],
  file: [<path key="p1" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />, <polyline key="p2" points="14 2 14 8 20 8" />, <line key="l1" x1="8" y1="13" x2="16" y2="13" />, <line key="l2" x1="8" y1="17" x2="16" y2="17" />],
  grid: [<rect key="r1" x="3" y="3" width="7" height="7" rx="1" />, <rect key="r2" x="14" y="3" width="7" height="7" rx="1" />, <rect key="r3" x="3" y="14" width="7" height="7" rx="1" />, <rect key="r4" x="14" y="14" width="7" height="7" rx="1" />],
  sort: [<line key="l1" x1="3" y1="6" x2="21" y2="6" />, <line key="l2" x1="6" y1="12" x2="18" y2="12" />, <line key="l3" x1="10" y1="18" x2="14" y2="18" />],
  check: [<polyline key="p" points="20 6 9 17 4 12" />],
  chevronDown: [<polyline key="p" points="6 9 12 15 18 9" />],
};

function ProposalIcon({ name, size = 18, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PROPOSAL_ICON_PATHS[name] || PROPOSAL_ICON_PATHS.file}
    </svg>
  );
}

function combineLogicLabel(value) {
  return COMBINE_LOGICS.find((option) => option.value === text(value))?.label || "Add";
}

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

function formatNumber(value) {
  return new Intl.NumberFormat("en-EG", { maximumFractionDigits: 2 }).format(number(value));
}

function formatMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function firstTag(product) {
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  return tags.map(text).find(Boolean) || "Uncategorized";
}

function normalizedUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

function normalizeProduct(product, index = 0) {
  return {
    id: text(product?.id) || `product-${index}`,
    name: text(product?.name) || "Untitled product",
    displayId: text(product?.displayId || product?.idCode || product?.id_code),
    unitPrice: product?.unitPrice === null || typeof product?.unitPrice === "undefined" ? null : number(product.unitPrice),
    unit: text(product?.unit),
    url: normalizedUrl(product?.url),
    // Keep the complete uploaded-file list; product.url is only the legacy first link.
    attachments: Array.isArray(product?.attachments)
      ? product.attachments.filter((file) => file?.url && file?.name).map((file) => ({
          name: text(file.name), url: text(file.url), size: Number(file.size) || 0,
        }))
      : [],
    imageUrl: normalizedUrl(product?.imageUrl),
    tags: Array.isArray(product?.tags) ? product.tags.map(text).filter(Boolean) : [],
  };
}

function normalizeProposal(proposal, index = 0) {
  return {
    id: text(proposal?.id) || `proposal-${index}`,
    name: text(proposal?.name) || "Untitled proposal",
    createdBy: text(proposal?.createdBy),
    createdById: text(proposal?.createdById),
    createdAt: text(proposal?.createdAt),
    updatedAt: text(proposal?.updatedAt),
    itemsCount: number(proposal?.itemsCount),
    folderId: text(proposal?.folderId ?? proposal?.folder_id),
    canEdit: proposal?.canEdit === true,
    combinedSources: Array.isArray(proposal?.combinedSources) ? proposal.combinedSources : [],
    combineLogic: text(proposal?.combineLogic),
    combineNote: text(proposal?.combineNote),
    combinedMatrix: Array.isArray(proposal?.combinedMatrix) ? proposal.combinedMatrix : [],
  };
}

function normalizeProposalFolder(folder, index = 0) {
  return {
    id: text(folder?.id) || `proposal-folder-${index}`,
    name: text(folder?.name) || "Untitled folder",
    parentFolderId: text(folder?.parentFolderId ?? folder?.parent_folder_id),
    createdBy: text(folder?.createdBy),
    createdById: text(folder?.createdById),
    canEdit: folder?.canEdit === true,
  };
}

function proposalFolderPath(folder, folders) {
  const nodes = new Map(folders.map((entry) => [entry.id, entry]));
  const visited = new Set();
  const path = [];
  let current = folder?.id ? nodes.get(folder.id) || folder : null;
  while (current?.id && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = nodes.get(current.parentFolderId);
  }
  return path;
}

function normalizeKit(kit, index = 0) {
  return {
    id: text(kit?.id) || `kit-${index}`,
    name: text(kit?.name) || "Untitled kit",
    folderId: text(kit?.folderId || kit?.folder_id),
    itemsCount: number(kit?.itemsCount),
  };
}

function normalizeKitFolder(folder, index = 0) {
  return {
    id: text(folder?.id) || `kit-folder-${index}`,
    name: text(folder?.name) || "Untitled folder",
  };
}

function normalizeUsersCenterMembers(payload) {
  const direct = Array.isArray(payload?.members) ? payload.members : [];
  const departments = Array.isArray(payload?.departments) ? payload.departments : [];
  const nested = departments.flatMap((department) => Array.isArray(department?.members) ? department.members : []);
  const seen = new Set();
  return [...direct, ...nested]
    .map((member) => {
      const fields = Array.isArray(member?.fields) ? member.fields : [];
      const stockField = fields.find((field) => ["school", "stocktaking column", "done column"].includes(lower(field?.label)));
      return {
        ...member,
        id: text(member?.id),
        name: text(member?.name) || "Unnamed",
        stocktakingColumn: text(member?.stocktakingColumn || member?.school || stockField?.value),
      };
    })
    .filter((member) => {
      if (!member.id || !member.name || seen.has(member.id)) return false;
      seen.add(member.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeSourceKits(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((source, index) => ({
      kitId: text(source?.kitId || source?.kit_id || source?.id),
      kitName: text(source?.kitName || source?.kit_name || source?.name),
      quantity: Math.max(1, Math.round(number(source?.quantity || source?.qty) || 1)),
      order: Number.isFinite(Number(source?.order)) ? Number(source.order) : index,
    }))
    .filter((source) => source.kitId || source.kitName);
}

function normalizeItem(item, index = 0) {
  return {
    id: text(item?.id) || `item-${index}`,
    proposalId: text(item?.proposalId),
    productId: text(item?.productId),
    productName: text(item?.productName) || "Untitled product",
    quantity: Math.max(1, Math.round(number(item?.quantity) || 1)),
    sourceKits: normalizeSourceKits(item?.sourceKits || item?.source_kits),
    createdAt: text(item?.createdAt),
    updatedAt: text(item?.updatedAt),
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
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    if (response.status === 413 && !text(body?.error || body?.message)) {
      throw new Error("The upload is still too large for the server. Choose a smaller image and try again.");
    }
    throw new Error(apiErrorMessage(body, "The request failed."));
  }
  return body;
}

function openDownload(url) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-proposals-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "Proposals"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Modal({ title, subtitle, icon = "◆", children, footer, onClose, wide = false, className = "" }) {
  return (
    <div className="products-modal-overlay next-proposals-classic-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`products-modal products-proposal-modal ${wide ? "next-proposals-classic-modal--wide" : ""} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="products-modal__close" onClick={onClose} aria-label="Close"><span aria-hidden="true">×</span></button>
        <div className="products-modal__header">
          <div className="products-modal__icon" aria-hidden="true">{icon}</div>
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        </div>
        <div className="next-proposals-modal__body">{children}</div>
        {footer ? <div className="products-modal__actions">{footer}</div> : null}
      </section>
    </div>
  );
}


function ProposalMultiSelect({ proposals, selectedIds, onToggle }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const selectedProposals = proposals.filter((proposal) => selectedIds.includes(proposal.id));
  const filtered = useMemo(() => {
    const needle = lower(query);
    if (!needle) return proposals;
    return proposals.filter((proposal) => lower(`${proposal.name} ${proposal.createdBy}`).includes(needle));
  }, [proposals, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const triggerText = selectedProposals.length
    ? `${selectedProposals.length} proposal${selectedProposals.length === 1 ? "" : "s"} selected`
    : "Choose proposals";

  return (
    <div className={`proposal-combine-multi ${open ? "is-open" : ""}`} ref={rootRef}>
      <span className="proposal-combine-multi__label">Proposals</span>
      <button type="button" className="proposal-combine-multi__trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>
          <strong>{triggerText}</strong>
          <small>{selectedProposals.length ? selectedProposals.slice(0, 3).map((proposal) => proposal.name).join(" · ") + (selectedProposals.length > 3 ? ` +${selectedProposals.length - 3}` : "") : "Select two or more proposals"}</small>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {open ? (
        <div className="proposal-combine-multi__menu" role="listbox" aria-multiselectable="true" aria-label="Choose proposals">
          <div className="proposal-combine-multi__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search proposals..." />
            {selectedIds.length ? <button type="button" onClick={() => selectedIds.forEach((id) => onToggle(id))}>Clear</button> : null}
          </div>
          <div className="proposal-combine-multi__options">
            {filtered.map((proposal) => {
              const active = selectedIds.includes(proposal.id);
              return (
                <button type="button" role="option" aria-selected={active} className={active ? "is-selected" : ""} key={proposal.id} onClick={() => onToggle(proposal.id)}>
                  <span className="proposal-combine-multi__check" aria-hidden="true">{active ? "✓" : ""}</span>
                  <span className="proposal-combine-multi__copy"><strong>{proposal.name}</strong><small>{formatNumber(proposal.itemsCount)} item{proposal.itemsCount === 1 ? "" : "s"}{proposal.createdBy ? ` · ${proposal.createdBy}` : ""}</small></span>
                </button>
              );
            })}
            {!filtered.length ? <div className="proposal-combine-multi__empty">No proposals match your search.</div> : null}
          </div>
          <div className="proposal-combine-multi__footer"><span>{selectedIds.length} selected</span><button type="button" onClick={() => setOpen(false)}>Done</button></div>
        </div>
      ) : null}
    </div>
  );
}


/* ERP_PROPOSALS_KITS_PARITY_V2: viewport-aware actions shared with Kits. */
function ProposalModernActionMenu({ title, children }) {
  const [placement, setPlacement] = useState(null);

  useEffect(() => {
    const items = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);
    const predictedHeight = 48 + items * 48 + 10;
    let raf = 0;
    const position = () => {
      const anchor = document.querySelector(".next-proposals-classic-parity .proposal-library-grid > .products-proposal-folder.is-menu-open");
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = window.innerHeight;
      const compact = window.matchMedia("(max-width: 768px)").matches;
      const safeBottom = compact ? 100 : 18;
      const width = Math.min(212, Math.max(140, viewportWidth - 24));
      const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
      const belowSpace = viewportHeight - safeBottom - rect.bottom;
      const topCandidate = belowSpace >= predictedHeight + 10
        ? rect.bottom + 8
        : rect.top - predictedHeight - 8;
      const top = Math.max(10, Math.min(topCandidate, viewportHeight - safeBottom - predictedHeight));
      setPlacement((prev) => prev && prev.left === left && prev.top === top && prev.width === width
        ? prev : { left, top, width });
    };
    position();
    // A second measurement settles the position when a folder entrance animation finishes.
    raf = window.requestAnimationFrame(position);
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
    };
  }, [title, children]);

  if (!placement || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="kit-modern-action-popover"
      role="menu"
      aria-label={title}
      style={{ position: "fixed", left: placement.left, top: placement.top, width: placement.width }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="kit-modern-action-popover__heading">{title}</div>
      {children}
    </div>,
    document.body,
  );
}

export default function ProposalsClient({
  account,
  initialCatalog,
  initialProposals,
  initialKits,
  initialKitFolders,
  initialFolders,
}) {
  const can = (action) => featureAllowed(account, `proposals.${action}`);
  const canCreate = can("create") && can("item_add");
  const [products, setProducts] = useState(() => (Array.isArray(initialCatalog?.products) ? initialCatalog.products : []).map(normalizeProduct));
  const [proposals, setProposals] = useState(() => (Array.isArray(initialProposals?.proposals) ? initialProposals.proposals : []).map(normalizeProposal));
  const [kits, setKits] = useState(() => (Array.isArray(initialKits?.kits) ? initialKits.kits : []).map(normalizeKit));
  const [kitFolders, setKitFolders] = useState(() => (Array.isArray(initialKitFolders?.folders) ? initialKitFolders.folders : []).map(normalizeKitFolder));
  const [folders, setFolders] = useState(() => (Array.isArray(initialFolders?.folders) ? initialFolders.folders : []).map(normalizeProposalFolder));
  const [activeFolder, setActiveFolder] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null);
  const [moveDialog, setMoveDialog] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [activeDetail, setActiveDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated-desc");
  const [selectedIds, setSelectedIds] = useState([]);
  const [combineLogic, setCombineLogic] = useState("add");
  const [exportColumns, setExportColumns] = useState(() => EXPORT_COLUMNS.map(([key]) => key));
  const [repeatedComponentMode, setRepeatedComponentMode] = useState("separate");
  const [combineTotalQty, setCombineTotalQty] = useState(true);
  const [groupBy, setGroupBy] = useState("component-tag");
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [kitMembership, setKitMembership] = useState(() => new Map());
  const [kitMembershipLoaded, setKitMembershipLoaded] = useState(false);
  const [kitMembershipBusy, setKitMembershipBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const { saveProgress, startSaveProgress, updateSaveProgress, finishSaveProgress } = useSaveProgress();
  const { actionLoading, startActionLoading, finishActionLoading } = useActionLoading();
  const [detailBusy, setDetailBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [passwordRequest, setPasswordRequest] = useState(null);
  const [addDialog, setAddDialog] = useState(false);
  const [makeOrderOpen, setMakeOrderOpen] = useState(false);
  const [sourceKitManagerOpen, setSourceKitManagerOpen] = useState(false);
  const [folderMenu, setFolderMenu] = useState("");
  const [proposalSelectMode, setProposalSelectMode] = useState(false);
  const [selectedProposalIds, setSelectedProposalIds] = useState([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const proposalBatchRunning = useRef(false);
  const folderLongPressTimerRef = useRef(null);
  const folderLongPressStartRef = useRef(null);
  const suppressFolderClickRef = useRef(false);
  const [combineOpen, setCombineOpen] = useState(false);
  const [detailEdit, setDetailEdit] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [draftErrors, setDraftErrors] = useState({ name: "", items: "" });
  const passwordResolver = useRef(null);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = search;
    input.placeholder = activeDetail ? "Search components, tags, kits, or ID..." : activeFolder ? "Search proposals in this folder..." : "Search folders or proposals...";
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.placeholder = "Search";
    };
  }, [activeDetail?.proposal?.id, activeFolder?.id, createMode]);

  useEffect(() => {
    const open = Boolean(activeDetail || detailBusy);
    document.body.classList.toggle("proposal-detail-open", open);
    return () => document.body.classList.remove("proposal-detail-open");
  }, [activeDetail, detailBusy]);

  useEffect(() => {
    const close = (event) => {
      if (!event.target.closest(".products-proposal-folder") && !event.target.closest(".kit-modern-action-popover")) setFolderMenu("");
      if (!event.target.closest(".proposal-download-menu-wrap") && !event.target.closest(".proposal-download-modal")) setDownloadMenuOpen(false);
      if (!event.target.closest(".proposal-sort-menu-wrap")) setSortMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setFolderMenu(""); setProposalSelectMode(false); setSelectedProposalIds([]);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => () => {
    if (folderLongPressTimerRef.current) window.clearTimeout(folderLongPressTimerRef.current);
  }, []);

  function cancelFolderLongPress() {
    if (folderLongPressTimerRef.current) {
      window.clearTimeout(folderLongPressTimerRef.current);
      folderLongPressTimerRef.current = null;
    }
    folderLongPressStartRef.current = null;
  }

  function startFolderLongPress(event, itemKey) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelFolderLongPress();
    suppressFolderClickRef.current = false;
    folderLongPressStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    folderLongPressTimerRef.current = window.setTimeout(() => {
      folderLongPressTimerRef.current = null;
      folderLongPressStartRef.current = null;
      suppressFolderClickRef.current = true;
      if (proposalSelectMode && itemKey.startsWith("proposal:")) {
        const id=itemKey.slice(9);
        setSelectedProposalIds((items) => items.includes(id) ? items : [...items,id]);
      }
      setFolderMenu(itemKey);
      try { if (navigator.vibrate) navigator.vibrate(28); } catch {}
    }, 550);
  }

  function moveFolderLongPress(event) {
    const start = folderLongPressStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) cancelFolderLongPress();
  }

  function openFolderActionsFromKeyboard(event, itemKey) {
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault();
      cancelFolderLongPress();
      suppressFolderClickRef.current = true;
      setFolderMenu(itemKey);
    }
  }

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const tags = useMemo(() => {
    const values = new Set((Array.isArray(initialCatalog?.tagsCatalog) ? initialCatalog.tagsCatalog : []).map(text).filter(Boolean));
    products.forEach((product) => values.add(firstTag(product)));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [initialCatalog, products]);

  const filteredProposals = useMemo(() => {
    const needle = lower(search);
    const parentId = activeFolder?.id || "";
    const rows = proposals.filter((proposal) => proposal.folderId === parentId &&
      (!needle || [proposal.name, proposal.createdBy, proposal.combineNote].some((value) => lower(value).includes(needle))));
    return rows.sort((a, b) => text(a.name).localeCompare(text(b.name), undefined, { numeric: true, sensitivity: "base" }) || text(a.id).localeCompare(text(b.id)));
  }, [proposals, search, sort, activeFolder?.id]);

  const filteredProposalFolders = useMemo(() => {
    const parentId = activeFolder?.id || "";
    const needle = lower(search);
    return folders.filter((folder) => folder.parentFolderId === parentId &&
      (!needle || [folder.name, folder.createdBy].some((value) => lower(value).includes(needle))))
      .sort((a, b) => text(a.name).localeCompare(text(b.name), undefined, { numeric: true, sensitivity: "base" }) || text(a.id).localeCompare(text(b.id)));
  }, [folders, search, activeFolder?.id]);

  const folderProposalCounts = useMemo(() => {
    const counts = new Map();
    for (const proposal of proposals) {
      if (proposal.folderId) counts.set(proposal.folderId, (counts.get(proposal.folderId) || 0) + 1);
    }
    return counts;
  }, [proposals]);

  const folderChildCounts = useMemo(() => {
    const counts = new Map();
    for (const folder of folders) {
      if (folder.parentFolderId) counts.set(folder.parentFolderId, (counts.get(folder.parentFolderId) || 0) + 1);
    }
    return counts;
  }, [folders]);

  const stats = useMemo(() => ({
    folders: proposals.length,
    components: proposals.reduce((sum, proposal) => sum + proposal.itemsCount, 0),
    owned: proposals.filter((proposal) => proposal.canEdit).length,
    combined: proposals.filter((proposal) => proposal.combinedSources.length > 0).length,
  }), [proposals]);

  const enrichedRows = useMemo(() => {
    const items = Array.isArray(activeDetail?.items) ? activeDetail.items.map(normalizeItem) : [];
    return items.map((item) => {
      const product = productMap.get(item.productId) || null;
      const unitPrice = product?.unitPrice;
      return {
        ...item,
        product,
        displayId: product?.displayId || "",
        name: product?.name || item.productName,
        tag: product ? firstTag(product) : "Uncategorized",
        unit: product?.unit || "",
        unitPrice,
        totalPrice: Number.isFinite(Number(unitPrice)) ? Number(unitPrice) * item.quantity : null,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeDetail, productMap]);

  const visibleEnrichedRows = useMemo(() => {
    const needle = lower(search);
    if (!activeDetail || !needle) return enrichedRows;

    const kitNameById = new Map(kits.map((kit) => [text(kit?.id), text(kit?.name)]));
    return enrichedRows.filter((row) => {
      const sourceKitNames = normalizeSourceKits(row?.sourceKits).flatMap((source) => {
        const localName = kitNameById.get(text(source?.kitId));
        return [source?.kitName, localName].map(text).filter(Boolean);
      });
      const productTags = Array.isArray(row?.product?.tags) ? row.product.tags.map(text).filter(Boolean) : [];
      const searchableValues = [
        row?.name,
        row?.displayId,
        row?.tag,
        ...productTags,
        ...sourceKitNames,
      ];
      return searchableValues.some((value) => lower(value).includes(needle));
    });
  }, [activeDetail, enrichedRows, kits, search]);

  const detailTotals = useMemo(() => enrichedRows.reduce((acc, row) => {
    acc.items += 1;
    acc.quantity += row.quantity;
    if (Number.isFinite(Number(row.totalPrice))) acc.value += Number(row.totalPrice);
    return acc;
  }, { items: 0, quantity: 0, value: 0 }), [enrichedRows]);

  const ensureKitMembership = async () => {
    if (kitMembershipLoaded) return kitMembership;
    if (kitMembershipBusy) return kitMembership;
    setKitMembershipBusy(true);
    try {
      const body = await requestJson(`/next/api/products/kits/membership?_ts=${Date.now()}`);
      const kitById = new Map(kits.map((kit) => [text(kit?.id), kit]));
      const folderById = new Map(kitFolders.map((folder) => [text(folder?.id), folder]));
      const next = new Map();
      (Array.isArray(body?.membership) ? body.membership : []).forEach((entry) => {
        const productId = text(entry?.productId);
        if (!productId) return;
        const memberships = (Array.isArray(entry?.kits) ? entry.kits : [])
          .map((kit) => {
            const id = text(kit?.id);
            const localKit = kitById.get(id) || null;
            const folderId = text(localKit?.folderId);
            const folderName = folderId ? text(folderById.get(folderId)?.name) || "Unfiled Kits" : "Unfiled Kits";
            return {
              id,
              name: text(kit?.name) || text(localKit?.name) || "Untitled kit",
              folderId,
              folderName,
            };
          })
          .filter((kit) => kit.id || kit.name)
          .sort((a, b) => a.folderName.localeCompare(b.folderName) || a.name.localeCompare(b.name));
        next.set(productId, memberships);
      });
      setKitMembership(next);
      setKitMembershipLoaded(true);
      return next;
    } finally {
      setKitMembershipBusy(false);
    }
  };

  const componentGroupedVisibleRows = useMemo(() => {
    const map = new Map();
    for (const row of visibleEnrichedRows) {
      const label = text(row?.tag) || "Uncategorized";
      const key = lower(label);
      if (!map.has(key)) map.set(key, { label, rows: [] });
      map.get(key).rows.push(row);
    }
    return [...map.values()]
      .map((group) => ({ ...group, rows: group.rows.slice().sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleEnrichedRows]);

  const kitGroupedVisibleRows = useMemo(() => {
    const foldersMap = new Map();
    const kitById = new Map(kits.map((kit) => [text(kit?.id), kit]));
    const folderById = new Map(kitFolders.map((folder) => [text(folder?.id), folder]));
    const addRow = (membership, row) => {
      const folderName = text(membership?.folderName) || "Unfiled Kits";
      const folderId = text(membership?.folderId);
      const folderKey = `${folderId || "unfiled"}:${lower(folderName)}`;
      if (!foldersMap.has(folderKey)) foldersMap.set(folderKey, { id: folderId, label: folderName, kits: new Map() });
      const folder = foldersMap.get(folderKey);
      const kitId = text(membership?.id || membership?.kitId);
      const kitName = text(membership?.name || membership?.kitName) || "Direct / legacy components";
      const kitKey = `${kitId || "unassigned"}:${lower(kitName)}`;
      if (!folder.kits.has(kitKey)) folder.kits.set(kitKey, { id: kitId, label: kitName, rows: [] });
      const kit = folder.kits.get(kitKey);
      if (!kit.rows.some((existing) => existing.id === row.id)) kit.rows.push(row);
    };

    for (const row of visibleEnrichedRows) {
      const sources = normalizeSourceKits(row?.sourceKits);
      if (!sources.length) {
        addRow({ folderName: "Untracked / Direct", name: "Direct / legacy components" }, row);
        continue;
      }

      sources.forEach((source, sourceIndex) => {
        const sourceQuantity = Math.max(1, Math.round(number(source?.quantity) || 1));
        const rawUnitPrice = row?.unitPrice;
        const unitPrice = Number(rawUnitPrice);
        const hasUnitPrice = rawUnitPrice !== null && rawUnitPrice !== undefined && rawUnitPrice !== "" && Number.isFinite(unitPrice);
        const sourceRow = {
          ...row,
          quantity: sourceQuantity,
          totalPrice: hasUnitPrice ? unitPrice * sourceQuantity : row?.totalPrice,
          _renderKey: `${row.id || row.productId || row.name}::${text(source?.kitId) || `name:${lower(source?.kitName)}`}::${sourceIndex}`,
          _sourceKit: source,
        };
        const localKit = kitById.get(text(source.kitId)) || null;
        const folderId = text(localKit?.folderId);
        const folderName = source.kitId ? (folderId ? (text(folderById.get(folderId)?.name) || "Unfiled Kits") : "Unfiled Kits") : "Untracked / Direct";
        addRow({ id: text(source.kitId), name: text(localKit?.name) || text(source.kitName) || "Direct / legacy components", folderId, folderName }, sourceRow);
      });
    }

    return [...foldersMap.values()]
      .map((folder) => ({
        ...folder,
        kits: [...folder.kits.values()]
          .map((kit) => ({ ...kit, rows: kit.rows.slice().sort((a, b) => a.name.localeCompare(b.name)) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => {
        if (a.id && !b.id) return -1;
        if (!a.id && b.id) return 1;
        return a.label.localeCompare(b.label);
      });
  }, [visibleEnrichedRows, kits, kitFolders]);

  const chooseGroupBy = async (nextMode) => {
    setGroupBy(nextMode);
    setSortMenuOpen(false);
  };

  const notify = (message, type = "success", title = "Proposals") => {
    setToast({ message, type, title });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 4500);
  };

  const syncProposal = (proposal) => {
    const normalized = normalizeProposal(proposal);
    setProposals((current) => {
      const exists = current.some((item) => item.id === normalized.id);
      return exists ? current.map((item) => item.id === normalized.id ? normalized : item) : [normalized, ...current];
    });
    setActiveDetail((current) => current?.proposal?.id === normalized.id ? { ...current, proposal: normalized } : current);
    return normalized;
  };

  const syncDetail = (body) => {
    const proposal = normalizeProposal(body?.proposal || activeDetail?.proposal || {});
    const items = (Array.isArray(body?.items) ? body.items : []).map(normalizeItem);
    setActiveDetail({ proposal, items });
    setEditName(proposal.name || "");
    syncProposal({ ...proposal, itemsCount: items.length });
    return { proposal, items };
  };

  const loadProposal = async (proposalId, options = {}) => {
    setSearch("");
    setCreateMode(false);
    setDetailEdit(Boolean(options.edit));
    if (Object.prototype.hasOwnProperty.call(options, "adminPassword")) setEditAdminPassword(options.adminPassword || "");
    setFolderMenu("");
    setDetailBusy(true);
    try {
      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposalId)}?_ts=${Date.now()}`);
      syncDetail(body);
      setDraftErrors({ name: "", items: "" });
    } catch (error) {
      notify(error?.message || "The proposal could not be loaded.", "error");
    } finally {
      setDetailBusy(false);
    }
  };

  const refreshFolders = async () => {
    setBusy(true);
    try {
      const [proposalBody, kitBody, kitFolderBody, productBody, proposalFolderBody] = await Promise.all([
        requestJson(`/next/api/products/proposals?_fresh=1&_ts=${Date.now()}`),
        requestJson(`/next/api/products/kits?_fresh=1&_ts=${Date.now()}`),
        requestJson(`/next/api/products/kit-folders?_fresh=1&_ts=${Date.now()}`),
        requestJson(`/next/api/products?_fresh=1&_ts=${Date.now()}`),
        requestJson(`/next/api/products/proposal-folders?_fresh=1&_ts=${Date.now()}`),
      ]);
      setProposals((proposalBody.proposals || []).map(normalizeProposal));
      setKits((kitBody.kits || []).map(normalizeKit));
      setKitFolders((kitFolderBody.folders || []).map(normalizeKitFolder));
      setFolders((proposalFolderBody.folders || []).map(normalizeProposalFolder));
      setProducts((productBody.products || []).map(normalizeProduct));
      if (activeDetail?.proposal?.id) await loadProposal(activeDetail.proposal.id);
      notify("Proposal data has been refreshed.");
    } catch (error) {
      notify(error?.message || "The data could not be refreshed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const askPassword = ({ title, message }) => new Promise((resolve) => {
    passwordResolver.current = resolve;
    setPasswordRequest({ title, message });
  });

  const closePassword = () => {
    const resolver = passwordResolver.current;
    passwordResolver.current = null;
    setPasswordRequest(null);
    resolver?.(null);
  };

  const verifyPassword = (password) => {
    const resolver = passwordResolver.current;
    passwordResolver.current = null;
    setPasswordRequest(null);
    resolver?.(password);
  };

  const protectedPassword = async (proposal, message) => {
    if (proposal?.canEdit) return "";
    return await askPassword({ title: "Admin password required", message: message || "This proposal belongs to another user." });
  };

  const backToProposals = () => {
    setSearch("");
    setActiveDetail(null);
    setDetailEdit(false);
    setCreateMode(false);
    setEditName("");
    setEditAdminPassword("");
    setDraftErrors({ name: "", items: "" });
    setAddDialog(false);
    setMakeOrderOpen(false);
    setSourceKitManagerOpen(false);
  };

  const openProposalFolder = (folder) => {
    setFolderMenu(""); setProposalSelectMode(false); setSelectedProposalIds([]);
    setSearch("");
    setActiveFolder(normalizeProposalFolder(folder));
  };

  const submitProposalFolder = async (name) => {
    const dialog = folderDialog;
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.mode === "rename" && dialog.folder?.id) {
        const body = await requestJson(`/next/api/products/proposal-folders/${encodeURIComponent(dialog.folder.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ name, adminPassword: dialog.adminPassword || "" }),
        });
        const updated = normalizeProposalFolder(body.folder || { ...dialog.folder, name });
        setFolders((current) => current.map((folder) => folder.id === updated.id ? updated : folder));
        setActiveFolder((current) => current?.id === updated.id ? updated : current);
        notify("Folder name updated.");
      } else {
        const body = await requestJson("/next/api/products/proposal-folders", {
          method: "POST",
          body: JSON.stringify({ name, parentFolderId: activeFolder?.id || "" }),
        });
        const folder = normalizeProposalFolder(body.folder);
        setFolders((current) => [folder, ...current.filter((item) => item.id !== folder.id)]);
        notify(`Folder “${folder.name}” created.`);
      }
      setFolderDialog(null);
    } catch (error) {
      notify(error?.message || "The folder could not be saved.", "error");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const renameProposalFolder = async (folder) => {
    if (!can("edit")) return;
    const adminPassword = folder.canEdit ? "" : await askPassword({
      title: "Admin password required",
      message: `Enter the Admin password to rename “${folder.name}”.`,
    });
    if (adminPassword === null) return;
    setFolderDialog({ mode: "rename", folder, value: folder.name, adminPassword });
  };

  const deleteProposalFolder = async (folder) => {
    if (!can("edit")) return;
    const adminPassword = folder.canEdit ? "" : await askPassword({
      title: "Admin password required",
      message: `Enter the Admin password to delete “${folder.name}”.`,
    });
    if (adminPassword === null) return;
    const confirmed = await confirmDelete({
      itemName: folder.name, itemType: "folder",
      title: "Delete folder?",
      message: `Delete “${folder.name}”? Proposals and direct subfolders inside it will move to the main Proposals page. No proposals will be deleted.`,
      confirmLabel: "Delete Folder",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await requestJson(`/next/api/products/proposal-folders/${encodeURIComponent(folder.id)}`, {
        method: "DELETE", body: JSON.stringify({ adminPassword }),
      });
      setFolders((current) => current.filter((item) => item.id !== folder.id)
        .map((item) => item.parentFolderId === folder.id ? { ...item, parentFolderId: "" } : item));
      setProposals((current) => current.map((proposal) =>
        proposal.folderId === folder.id ? { ...proposal, folderId: "" } : proposal));
      if (activeFolder?.id === folder.id) setActiveFolder(null);
      setFolderMenu("");
      notify("Folder deleted. Its contents moved to Main Proposals.");
    } catch (error) {
      notify(error?.message || "The folder could not be deleted.", "error");
    } finally {
      setBusy(false);
    }
  };

  const moveProposal = async (proposal) => {
    if (!can("edit")) return;
    const adminPassword = await protectedPassword(proposal,
      `Enter the Admin password to move “${proposal.name}”.`);
    if (adminPassword === null) return;
    setMoveDialog({ proposal, adminPassword });
    setFolderMenu("");
  };

  const submitMoveProposal = async (folderId) => {
    const dialog = moveDialog;
    if (dialog?.bulkIds?.length) {
      const done = await runProposalBatch("move", { ids: dialog.bulkIds, folderId });
      if (done) setMoveDialog(null);
      return;
    }
    if (!dialog?.proposal?.id) return;
    const targetId = text(folderId);
    if (targetId === text(dialog.proposal.folderId)) return;
    setBusy(true);
    try {
      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(dialog.proposal.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: dialog.proposal.name, folderId: targetId,
          adminPassword: dialog.adminPassword || "" }),
      });
      const updated = syncProposal(body.proposal);
      setMoveDialog(null);
      notify(`“${updated.name}” moved to ${folders.find((folder) => folder.id === targetId)?.name || "Main Proposals"}.`);
    } catch (error) {
      notify(error?.message || "The proposal could not be moved.", "error");
      throw error;
    } finally { setBusy(false); }
  };

  const startCreateProposal = () => {
    if (!can("create") || !can("item_add")) return;
    setSearch("");
    const createdBy = text(account?.name || account?.fullName || account?.username || account?.email);
    setCreateMode(true);
    setDetailEdit(true);
    setEditAdminPassword("");
    setEditName("");
    setDraftErrors({ name: "", items: "" });
    setActiveDetail({
      proposal: {
        id: "",
        name: "",
        createdBy,
        createdById: text(account?.id || account?.userSupabaseId),
        createdAt: "",
        updatedAt: "",
        itemsCount: 0,
        folderId: activeFolder?.id || "",
        canEdit: true,
        combinedSources: [],
        combineLogic: "",
        combineNote: "",
        combinedMatrix: [],
      },
      items: [],
    });
  };

  const enterEditProposal = async (proposal) => {
    const adminPassword = await protectedPassword(proposal, `Enter the Admin password to edit “${proposal.name}”.`);
    if (adminPassword === null) return;
    setEditAdminPassword(adminPassword);
    await loadProposal(proposal.id, { edit: true, adminPassword });
  };

  const mergedDraftQuantity = (existingQuantity, incomingQuantity, logic = "add") => {
    const existing = Math.max(1, Math.round(number(existingQuantity) || 1));
    const incoming = Math.max(1, Math.round(number(incomingQuantity) || 1));
    if (logic === "max") return Math.max(existing, incoming);
    if (logic === "min") return Math.min(existing, incoming);
    return existing + incoming;
  };

  const mergeDraftSourceKits = (existingSources, incomingSources, existingQuantity, incomingQuantity, logic = "add") => {
    const existing = normalizeSourceKits(existingSources);
    const incoming = normalizeSourceKits(incomingSources);
    const existingQty = Math.max(1, Math.round(number(existingQuantity) || 1));
    const incomingQty = Math.max(1, Math.round(number(incomingQuantity) || 1));
    if (logic === "max") return incomingQty > existingQty ? incoming : existing;
    if (logic === "min") return incomingQty < existingQty ? incoming : existing;
    if (!incoming.length) return existing;
    const merged = new Map();
    [...existing, ...incoming].forEach((source, index) => {
      const key = text(source.kitId) || `name:${lower(source.kitName)}`;
      const current = merged.get(key);
      if (current) current.quantity += Math.max(1, Math.round(number(source.quantity) || 1));
      else merged.set(key, { ...source, order: Number.isFinite(Number(source.order)) ? Number(source.order) : index });
    });
    return [...merged.values()].sort((a, b) => a.order - b.order);
  };

  const addDraftProducts = (rows, mergeLogic = "add") => {
    setActiveDetail((current) => {
      const items = Array.isArray(current?.items) ? [...current.items] : [];
      rows.forEach((entry) => {
        const productId = text(entry?.productId);
        if (!productId) return;
        const quantity = Math.max(1, Math.round(number(entry?.quantity) || 1));
        const incomingSources = normalizeSourceKits(entry?.sourceKits);
        const effectiveSources = incomingSources.length ? incomingSources : [{ kitId: "", kitName: "Direct components", quantity, order: 0 }];
        const product = productMap.get(productId);
        const existingIndex = items.findIndex((item) => text(item.productId) === productId);
        if (existingIndex >= 0) {
          const existing = items[existingIndex];
          items[existingIndex] = {
            ...existing,
            quantity: mergedDraftQuantity(existing.quantity, quantity, mergeLogic),
            sourceKits: mergeDraftSourceKits(existing.sourceKits, effectiveSources, existing.quantity, quantity, mergeLogic),
            updatedAt: new Date().toISOString(),
          };
        } else {
          items.push(normalizeItem({
            id: `draft-proposal-item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            proposalId: "",
            productId,
            productName: text(entry?.productName || product?.name) || "Untitled product",
            quantity,
            sourceKits: effectiveSources,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, items.length));
        }
      });
      return { ...(current || {}), items };
    });
    setDraftErrors((current) => ({ ...current, items: "" }));
  };

  const saveProposal = async () => {
    const cleanName = text(editName);
    const rows = Array.isArray(activeDetail?.items) ? activeDetail.items : [];
    const errors = {
      name: cleanName ? "" : "Proposal name is required.",
      items: rows.length ? "" : createMode ? "Add at least one component before saving the proposal." : "Add at least one component before saving changes.",
    };
    setDraftErrors(errors);
    if (errors.name || errors.items) return;

    const validRows = rows.filter((row) => row.productId);
    setBusy(true);
    startSaveProgress({
      title: createMode ? "Saving proposal" : "Saving changes",
      message: createMode ? `Preparing ${validRows.length} component${validRows.length === 1 ? "" : "s"}…` : "Updating your proposal…",
    });
    try {
      if (createMode) {
        updateSaveProgress(22, `Preparing ${validRows.length} components for bulk save…`);
        const createdBody = await requestJson("/next/api/products/proposals", {
          method: "POST",
          body: JSON.stringify({
            name: cleanName,
            folderId: activeFolder?.id || "",
            adminPassword: editAdminPassword,
            items: validRows.map((row) => ({ productId: row.productId, quantity: row.quantity, sourceKits: normalizeSourceKits(row.sourceKits) })),
          }),
        });
        updateSaveProgress(88, "Components saved. Finalizing proposal…");
        const created = normalizeProposal({ ...(createdBody.proposal || {}), canEdit: true, itemsCount: validRows.length });
        if (!created.id) throw new Error("Proposal was created but the proposal ID was not returned.");

        setProposals((current) => [created, ...current.filter((entry) => entry.id !== created.id)]);
        updateSaveProgress(97, "Proposal is ready.");
        notify("Proposal saved successfully.");
        await finishSaveProgress("done", "Proposal saved successfully.");
        backToProposals();
        return;
      }

      const proposal = activeDetail?.proposal;
      if (!proposal?.id) throw new Error("Proposal ID is missing.");
      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: cleanName, adminPassword: editAdminPassword, itemsCount: rows.length }),
      });
      updateSaveProgress(86, "Applying the latest changes…");
      const updated = normalizeProposal(body.proposal || { ...proposal, name: cleanName });
      setActiveDetail((current) => current ? { ...current, proposal: updated } : current);
      setProposals((current) => current.map((entry) => entry.id === updated.id ? { ...updated, itemsCount: rows.length } : entry));
      setEditName(updated.name);
      setDraftErrors({ name: "", items: "" });
      notify("Changes saved.");
      await finishSaveProgress("done", "Proposal changes saved successfully.");
    } catch (error) {
      const message = error?.message || `Failed to ${createMode ? "create" : "update"} proposal.`;
      await finishSaveProgress("failed", message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const submitNameDialog = async (name) => {
    const dialog = nameDialog;
    if (!dialog) return;
    let adminPassword = "";
    if (dialog.mode === "create") {
      adminPassword = await askPassword({ title: "Create Proposal", message: "Enter the Admin password to create a new proposal folder." });
      if (adminPassword === null) return;
    } else if (dialog.mode === "rename") {
      adminPassword = await protectedPassword(dialog.proposal, "Enter the Admin password to rename a proposal created by another user.");
      if (adminPassword === null) return;
    }
    setBusy(true);
    try {
      if (dialog.mode === "create") {
        const body = await requestJson("/next/api/products/proposals", { method: "POST", body: JSON.stringify({ name, adminPassword }) });
        syncProposal({ ...(body.proposal || {}), canEdit: true });
        notify(`“${name}” was created.`);
      } else if (dialog.mode === "copy") {
        const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(dialog.proposal.id)}/copy`, { method: "POST", body: JSON.stringify({ name }) });
        const copied = syncProposal(body.proposal);
        notify(`A copy named “${name}” was created.`);
        if (copied?.id) {
          setNameDialog(null);
          await loadProposal(copied.id, { edit: true, adminPassword: "" });
          return;
        }
      } else if (dialog.mode === "rename") {
        const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(dialog.proposal.id)}`, { method: "PATCH", body: JSON.stringify({ name, adminPassword }) });
        syncProposal(body.proposal);
        notify("Proposal name updated.");
      } else if (dialog.mode === "combine") {
        const body = await requestJson("/next/api/products/proposals/combine/save", {
          method: "POST",
          body: JSON.stringify({ name, proposalIds: selectedIds, combineLogic }),
        });
        syncProposal(body.proposal);
        setSelectedIds([]);
        notify("Combined proposal saved.");
      }
      setNameDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const deleteProposal = async (proposal) => {
    const confirmed = await confirmDelete({
      itemName: proposal.name,
      itemType: "proposal",
      title: "Delete proposal?",
      message: `You’re going to permanently delete “${proposal.name}” and all saved components. This action cannot be undone.`,
      confirmLabel: "Yes, Delete!",
    });
    if (!confirmed) return;
    const adminPassword = await protectedPassword(proposal, "Enter the Admin password to delete a proposal created by another user.");
    if (adminPassword === null) return;
    setBusy(true);
    try {
      await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}`, { method: "DELETE", body: JSON.stringify({ adminPassword }) });
      setProposals((current) => current.filter((item) => item.id !== proposal.id));
      setSelectedIds((current) => current.filter((id) => id !== proposal.id));
      if (activeDetail?.proposal?.id === proposal.id) setActiveDetail(null);
      notify("Proposal deleted.");
    } catch (error) {
      notify(error?.message || "The proposal could not be deleted.", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitAdd = async ({ mode, selected, selections = [], quantity, mergeLogic }) => {
    const proposal = activeDetail?.proposal;
    const selectionCount = mode === "product" || mode === "kit" ? selections.length : 1;
    let loadingStarted = false;

    const beginAddLoading = (message) => {
      loadingStarted = true;
      startActionLoading({
        title: mode === "kit" ? "Adding kits" : "Adding components",
        message: message || `Adding ${selectionCount} selection${selectionCount === 1 ? "" : "s"}…`,
      });
    };

    const completeAdd = async (message) => {
      setAddDialog(false);
      await finishActionLoading("done", message);
    };

    try {
      if (createMode) {
        if (mode === "product") {
          const rows = selections.map((entry) => {
            const product = productMap.get(entry.selected);
            if (!product) return null;
            return { productId: product.id, productName: product.name, quantity: Math.max(1, Math.round(number(entry.quantity) || 1)) };
          }).filter(Boolean);
          if (!rows.length) throw new Error("No valid products were selected.");
          beginAddLoading(`Adding ${rows.length} product${rows.length === 1 ? "" : "s"} to the proposal…`);
          addDraftProducts(rows, mergeLogic);
          notify(`${rows.length} product${rows.length === 1 ? "" : "s"} added to proposal draft.`);
          await completeAdd(`${rows.length} product${rows.length === 1 ? "" : "s"} added successfully.`);
          return;
        }
        if (mode === "tag") {
          const rows = products
            .filter((product) => firstTag(product) === selected)
            .map((product) => ({ productId: product.id, productName: product.name, quantity }));
          if (!rows.length) throw new Error("No products were found under this tag.");
          beginAddLoading(`Adding ${rows.length} products to the proposal…`);
          addDraftProducts(rows, mergeLogic);
          notify(`${rows.length} products added from the selected tag.`);
          await completeAdd(`${rows.length} products added successfully.`);
          return;
        }
        if (mode === "kit") {
          if (!selections.length) throw new Error("Choose at least one kit.");
          beginAddLoading(`Loading ${selections.length} kit${selections.length === 1 ? "" : "s"} and adding their components…`);
          const kitRows = [];
          for (const entry of selections) {
            const multiplier = Math.max(1, Math.round(number(entry.quantity) || 1));
            const kitBody = await requestJson(`/next/api/products/kits/${encodeURIComponent(entry.selected)}?_ts=${Date.now()}`);
            const localKit = kits.find((kit) => text(kit?.id) === text(entry.selected)) || null;
            const rows = (Array.isArray(kitBody?.items) ? kitBody.items : []).map(normalizeItem).map((item) => {
              const sourceQuantity = Math.max(1, Math.round(number(item.quantity) || 1)) * multiplier;
              return {
                productId: item.productId,
                productName: item.productName,
                quantity: sourceQuantity,
                sourceKits: [{ kitId: text(entry.selected), kitName: text(localKit?.name) || text(kitBody?.kit?.name) || "Untitled kit", quantity: sourceQuantity }],
              };
            });
            kitRows.push(...rows);
          }
          if (!kitRows.length) throw new Error("The selected kits have no components.");
          addDraftProducts(kitRows, mergeLogic);
          notify(`${selections.length} kit${selections.length === 1 ? "" : "s"} added to the proposal draft.`);
          await completeAdd(`${selections.length} kit${selections.length === 1 ? "" : "s"} added successfully.`);
          return;
        }
      }

      if (!proposal?.id) return;
      if (mode === "product" && !selections.length) throw new Error("Choose at least one product.");
      if (mode === "kit" && !selections.length) throw new Error("Choose at least one kit.");

      const adminPassword = editAdminPassword || await protectedPassword(proposal, "Enter the Admin password to modify a proposal created by another user.");
      if (adminPassword === null) return;
      if (adminPassword && !editAdminPassword) setEditAdminPassword(adminPassword);
      setBusy(true);
      beginAddLoading(mode === "kit"
        ? `Adding ${selections.length} kit${selections.length === 1 ? "" : "s"} to the proposal…`
        : `Adding ${selections.length || 1} component${(selections.length || 1) === 1 ? "" : "s"} to the proposal…`);

      if (mode === "product") {
        let body = null;
        for (const entry of selections) {
          body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}/items`, {
            method: "POST",
            body: JSON.stringify({
              productId: entry.selected,
              quantity: Math.max(1, Math.round(number(entry.quantity) || 1)),
              mergeLogic,
              adminPassword,
            }),
          });
        }
        const pendingName = editName;
        if (body) syncDetail(body);
        setEditName(pendingName);
        notify(`${selections.length} product${selections.length === 1 ? "" : "s"} added.`);
        await completeAdd(`${selections.length} product${selections.length === 1 ? "" : "s"} added successfully.`);
        return;
      }

      if (mode === "kit") {
        let body = null;
        for (const entry of selections) {
          body = await requestJson(`/next/api/products/proposals/items-by-kit?id=${encodeURIComponent(proposal.id)}`, {
            method: "POST",
            body: JSON.stringify({
              kitId: entry.selected,
              quantity: Math.max(1, Math.round(number(entry.quantity) || 1)),
              mergeLogic,
              adminPassword,
            }),
          });
        }
        const pendingName = editName;
        if (body) syncDetail(body);
        setEditName(pendingName);
        notify(`${selections.length} kit${selections.length === 1 ? "" : "s"} added.`);
        await completeAdd(`${selections.length} kit${selections.length === 1 ? "" : "s"} added successfully.`);
        return;
      }

      const endpoint = `/next/api/products/proposals/${encodeURIComponent(proposal.id)}/items`;
      const payload = { productId: selected, quantity, mergeLogic, adminPassword };
      const body = await requestJson(endpoint, { method: "POST", body: JSON.stringify(payload) });
      const pendingName = editName;
      syncDetail(body);
      setEditName(pendingName);
      notify(`${body.addedCount || "Components"} added.`);
      await completeAdd("Components added successfully.");
    } catch (error) {
      if (loadingStarted) await finishActionLoading("failed", error?.message || "The components could not be added.");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const removeWholeSourceKit = async (kit) => {
    if (!(detailEdit || activeDetail?.proposal?.canEdit) || !kit?.id || !kit.canRemove || busy) return;
    const proposal = activeDetail?.proposal;
    const confirmed = await confirmDelete({
      itemName: kit.name,
      itemType: "source kit",
      title: "Remove source kit?",
      message: `Remove “${kit.name}” from this proposal? ${kit.components} component${kit.components === 1 ? "" : "s"} will be adjusted, subtracting ${formatNumber(kit.totalQuantity)} total units. Shared components will keep quantities belonging to other kits. The original saved kit will not be deleted.`,
      confirmLabel: "Remove Kit",
    });
    if (!confirmed) return;
    if (createMode) {
      try {
        // Calculate the entire next draft before committing any state change.
        const nextItems = removeSourceKitFromDraft(activeDetail?.items || [], kit.id);
        setActiveDetail((current) => current ? { ...current, items: nextItems } : current);
        notify(`“${kit.name}” removed from the draft.`);
      } catch (error) {
        notify(error?.message || "The kit could not be removed.", "error");
      }
      return;
    }
    const adminPassword = editAdminPassword || await protectedPassword(proposal, "Enter the Admin password to remove a source kit from this proposal.");
    if (adminPassword === null) return;
    if (adminPassword && !editAdminPassword) setEditAdminPassword(adminPassword);
    setBusy(true);
    startActionLoading({ title: "Removing source kit", message: `Recalculating quantities for “${kit.name}”…` });
    try {
      const pendingName = editName;
      const result = await requestJson("/next/api/products/proposals/remove-source-kit", {
        method: "POST",
        body: JSON.stringify({
          proposalId: proposal.id, kitId: kit.id, expectedComponents: kit.components,
          expectedQuantity: kit.totalQuantity, adminPassword,
        }),
      });
      syncDetail(result);
      setEditName(pendingName);
      notify(`“${kit.name}” removed. Remaining quantities have been updated.`);
      await finishActionLoading("done", `Source kit “${kit.name}” removed successfully.`);
    } catch (error) {
      await finishActionLoading("failed", error?.message || "Could not remove source kit.");
      notify(error?.message || "Could not remove source kit.", "error");
    } finally {
      setBusy(false);
    }
  };

  const updateQuantity = async (row, value) => {
    const quantity = Math.max(1, Math.round(number(value) || 1));
    if (quantity === row.quantity) return;
    if (createMode) {
      setActiveDetail((current) => ({
        ...(current || {}),
        items: (current?.items || []).map((item) => item.id === row.id ? { ...item, quantity, updatedAt: new Date().toISOString() } : item),
      }));
      notify("Quantity updated.");
      return;
    }
    const proposal = activeDetail?.proposal;
    const adminPassword = editAdminPassword || await protectedPassword(proposal, "Enter the Admin password to modify a proposal created by another user.");
    if (adminPassword === null) return;
    if (adminPassword && !editAdminPassword) setEditAdminPassword(adminPassword);
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, adminPassword }),
      });
      syncDetail(body);
      setEditName(pendingName);
      notify("Quantity updated.");
    } catch (error) {
      notify(error?.message || "The quantity could not be updated.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (row) => {
    const confirmed = await confirmDelete({
      itemName: row.name,
      itemType: "component",
      title: "Remove component?",
      message: `Remove “${row.name}” from this proposal? The product itself will stay in the Products catalogue.`,
      confirmLabel: "Remove Component",
    });
    if (!confirmed) return;
    if (createMode) {
      setActiveDetail((current) => ({
        ...(current || {}),
        items: (current?.items || []).filter((item) => item.id !== row.id),
      }));
      notify("Component removed.");
      return;
    }
    const proposal = activeDetail?.proposal;
    const adminPassword = editAdminPassword || await protectedPassword(proposal, "Enter the Admin password to modify a proposal created by another user.");
    if (adminPassword === null) return;
    if (adminPassword && !editAdminPassword) setEditAdminPassword(adminPassword);
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword }),
      });
      syncDetail(body);
      setEditName(pendingName);
      notify("Component removed.");
    } catch (error) {
      notify(error?.message || "The component could not be removed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const openMakeOrder = () => {
    setDownloadMenuOpen(false);
    setSortMenuOpen(false);
    setMakeOrderOpen(true);
    setMembersLoading(true);
    requestJson(`/next/api/team-members?_fresh=1&_ts=${Date.now()}`)
      .then((body) => setMembers(normalizeUsersCenterMembers(body)))
      .catch((error) => notify(error?.message || "Users Center members could not be refreshed.", "error"))
      .finally(() => setMembersLoading(false));
  };

  const makeOrder = async ({ teamMemberId, adminPassword }) => {
    const proposal = activeDetail?.proposal;
    if (!proposal?.id) throw new Error("Proposal ID is missing.");
    setBusy(true);
    startActionLoading({ title: "Creating order", message: "Creating a normal order from the proposal components…" });
    try {
      const body = await requestJson(`/next/api/products/proposals/make-order?id=${encodeURIComponent(proposal.id)}`, {
        method: "POST",
        body: JSON.stringify({ teamMemberId, adminPassword }),
      });
      const count = Number(body?.count || 0);
      const memberName = text(body?.member?.name) || "the selected user";
      const orderId = text(body?.orderId) || (body?.orderNumber ? `ORD-${body.orderNumber}` : "Order");
      await finishActionLoading("done", `${orderId} created for ${memberName} with ${count} component${count === 1 ? "" : "s"}.`);
      setMakeOrderOpen(false);
      notify(`${orderId} created for ${memberName}.`);
      return body;
    } catch (error) {
      await finishActionLoading("failed", error?.message || "The order could not be created.");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (proposalId) => {
    setSelectedIds((current) => current.includes(proposalId) ? current.filter((id) => id !== proposalId) : [...current, proposalId]);
  };

  const downloadSingle = (type) => {
    if (!activeDetail?.proposal?.id) return;
    const columns = exportColumns.length ? exportColumns.join(",") : EXPORT_COLUMNS.map(([key]) => key).join(",");
    const params = new URLSearchParams({ columns, groupBy, repeatedComponents: repeatedComponentMode });
    openDownload(`/next/api/products/export-direct?scope=proposal&id=${encodeURIComponent(activeDetail.proposal.id)}&kind=${encodeURIComponent(type)}&${params.toString()}`);
    setDownloadMenuOpen(false);
  };

  const downloadCombined = (type) => {
    if (selectedIds.length < 2) return notify("Select at least two proposals.", "error");
    const params = new URLSearchParams({
      proposalIds: selectedIds.join(","),
      logic: combineLogic,
      columns: exportColumns.join(","),
      totalQty: combineTotalQty ? "1" : "0",
      groupBy,
      repeatedComponents: repeatedComponentMode,
    });
    openDownload(`/next/api/products/export-direct?scope=combined&kind=${encodeURIComponent(type)}&${params.toString()}`);
  };

  const toggleExportColumn = (key) => {
    setExportColumns((current) => current.includes(key) ? (current.length === 1 ? current : current.filter((item) => item !== key)) : [...current, key]);
  };

  const renderComponentCard = (row, proposalForCard = activeDetail?.proposal) => {
    const resource = cartProductResource(row.product);
    const matrixRow = Array.isArray(proposalForCard?.combinedMatrix)
      ? proposalForCard.combinedMatrix.find((entry) => {
          const entryProductId = text(entry?.productId || entry?.product_id);
          if (row.productId && entryProductId && row.productId === entryProductId) return true;
          return lower(entry?.name || entry?.productName || entry?.product_name) === lower(row.name);
        })
      : null;
    const sourceQuantities = proposalForCard?.combineLogic === "separate" && matrixRow?.sourceQuantities && proposalForCard?.combinedSources?.length
      ? proposalForCard.combinedSources.map((source) => ({
          id: text(source?.id),
          name: text(source?.name) || "Proposal",
          quantity: number(matrixRow.sourceQuantities?.[text(source?.id)]),
        }))
      : [];
    return (
      <article className={`kit-component-card proposal-component-card ${detailEdit ? "is-editable" : "is-view"}`} key={row._renderKey || row.id}>
        <header className="kit-component-card__head proposal-component-card__head">
          <div className="kit-component-card__title">
            <span>Component</span>
            <h4>{row.name}</h4>
            {[row.displayId, row.tag, row.unit].filter(Boolean).length ? (
              <small className="proposal-component-card__meta">{[row.displayId, row.tag, row.unit].filter(Boolean).join(" · ")}</small>
            ) : null}
          </div>
        </header>

        {sourceQuantities.length ? (
          <div className="proposal-component-card__sources">
            {sourceQuantities.map((source) => (
              <div key={source.id || source.name}>
                <span>{source.name}</span>
                <strong>{formatNumber(source.quantity)}</strong>
              </div>
            ))}
          </div>
        ) : null}

        <div className="kit-component-card__metrics proposal-component-card__metrics">
          <div className="kit-component-card__metric kit-component-card__metric--qty">
            <span>{sourceQuantities.length ? "Total Qty" : "Qty"}</span>
            {detailEdit && (createMode || can("item_edit")) ? (
              <input
                className="proposal-item-qty kit-component-card__qty-input"
                type="number"
                min="1"
                step="1"
                defaultValue={row.quantity}
                key={`${row.id}-${row.quantity}`}
                onBlur={(event) => updateQuantity(row, event.target.value)}
                aria-label={`Quantity for ${row.name}`}
              />
            ) : <strong>{formatNumber(row.quantity)}</strong>}
          </div>
          <div className="kit-component-card__metric">
            <span>Unit price</span>
            <strong>{formatMoney(row.unitPrice)}</strong>
          </div>
          <div className="kit-component-card__metric kit-component-card__metric--total">
            <span>Total price</span>
            <strong>{formatMoney(row.totalPrice)}</strong>
          </div>
        </div>

        <footer className="kit-component-card__actions proposal-component-card__actions">
          {resource.href ? (
            <a className="kit-component-card__action kit-component-card__action--link" href={resource.href}
              target={resource.isZip ? undefined : "_blank"}
              rel={resource.isZip ? undefined : "noreferrer"}
              aria-label={resource.isZip ? `Download all ${resource.fileCount} files for ${row.name} as ZIP` : `Open product link for ${row.name}`}
              title={resource.isZip ? `Download ${resource.fileCount} files as ZIP` : "Open link"}>
              <ProposalIcon name={resource.isZip ? "download" : "externalLink"} />
              <span>{resource.isZip ? `Download ZIP (${resource.fileCount} files)` : "Open link"}</span>
            </a>
          ) : (
            <span className="kit-component-card__action kit-component-card__action--disabled" aria-label="No product link">
              <span aria-hidden="true">—</span><span>No link</span>
            </span>
          )}
          {detailEdit && (createMode || can("item_delete")) ? (
            <button type="button" className="kit-component-card__action kit-component-card__action--remove" onClick={() => removeItem(row)} aria-label={`Remove ${row.name}`}>
              <span aria-hidden="true">×</span><span>Remove</span>
            </button>
          ) : null}
        </footer>
      </article>
    );
  };

  if (activeDetail || detailBusy) {
    const proposal = activeDetail?.proposal;
    return (
      <main className="products-shell proposals-shell next-proposals-classic-parity">
        {activeDetail ? <HeaderFolderBreadcrumb segments={[
          {label:"Proposals",icon:"file-text",onClick:backToProposals},
          {label:createMode ? "Create New Proposal" : activeDetail.proposal?.name || "Proposal",icon:"file-text"}
        ]}/> : null}
        <Toast toast={toast} onClose={() => setToast(null)} />
        <SaveProgressModal state={saveProgress} />
        <ActionLoadingModal state={actionLoading} zIndex={13000} />
        {downloadMenuOpen ? (
          <ProposalDownloadModal
            columns={exportColumns}
            repeatedComponentMode={repeatedComponentMode}
            onRepeatedComponentModeChange={setRepeatedComponentMode}
            onToggleColumn={toggleExportColumn}
            onDownload={downloadSingle}
            onClose={() => setDownloadMenuOpen(false)}
          />
        ) : null}
        {sourceKitManagerOpen && activeDetail ? (
          <ProposalSourceKitsModal
            items={activeDetail.items || []}
            kits={kits}
            folders={kitFolders}
            editable={detailEdit || Boolean(proposal?.canEdit)}
            busy={busy}
            onClose={() => setSourceKitManagerOpen(false)}
            onRemove={removeWholeSourceKit}
          />
        ) : null}
        {makeOrderOpen && proposal ? (
          <MakeOrderModal
            proposal={proposal}
            members={members}
            membersLoading={membersLoading}
            busy={busy}
            onClose={() => setMakeOrderOpen(false)}
            onSubmit={makeOrder}
          />
        ) : null}
        <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
          <section className="proposals-panel">
            <section className={`products-proposal-detail ${createMode ? "is-create" : detailEdit ? "is-edit" : "is-view"}`}>
              {detailBusy && !activeDetail ? (
                <div className="products-loading-card" role="status" aria-live="polite">
                  <div className="products-spinner" aria-hidden="true" />
                  <div><strong>Loading proposal</strong></div>
                </div>
              ) : (
                <>
                  {createMode ? (
                    <header className="products-proposal-detail__head proposal-create-label-head">
                      <div className="proposal-create-title-pill">
                        <button type="button" className="products-back-btn" onClick={backToProposals} aria-label="Back to proposals">←</button>
                        <span>Create New Proposal</span>
                      </div>
                      {(createMode || can("item_delete")) ? <button type="button" className="products-btn proposal-manage-kits-btn" onClick={() => setSourceKitManagerOpen(true)}><ProposalIcon name="folder" /><span>Manage Kits</span></button> : null}
                    </header>
                  ) : (
                    <header className="products-proposal-detail__head proposal-detail-head--compact">
                      <div className="proposal-detail-actions proposal-detail-actions--classic">
                        <div className="proposal-download-menu-wrap">
                          <button type="button" className="btn b2b-download-primary proposal-download-btn" onClick={() => { setDownloadMenuOpen(true); setSortMenuOpen(false); }}>
                            <ProposalIcon name="download" /><span>Download</span><ProposalIcon name="chevronDown" size={15} />
                          </button>
                        </div>
                        {can("item_delete") ? <button type="button" className="products-btn proposal-manage-kits-btn" onClick={() => { setSourceKitManagerOpen(true); setSortMenuOpen(false); setDownloadMenuOpen(false); }}>
                          <ProposalIcon name="folder" /><span>Manage Kits</span>
                        </button> : null}
                        <div className="proposal-sort-menu-wrap">
                          <button type="button" className="products-btn proposal-sort-btn" onClick={() => { setSortMenuOpen((open) => !open); setDownloadMenuOpen(false); }}>
                            <ProposalIcon name="sort" /><span>Sort</span><ProposalIcon name="chevronDown" size={15} />
                          </button>
                          {sortMenuOpen ? (
                            <div className="proposal-sort-menu" role="menu">
                              <button type="button" className={groupBy === "component-tag" ? "is-active" : ""} onClick={() => chooseGroupBy("component-tag")}>
                                <span className="proposal-sort-menu__check">{groupBy === "component-tag" ? "✓" : ""}</span>
                                <span><strong>By components tag</strong><small>Group by the product component tag.</small></span>
                              </button>
                              <button type="button" className={groupBy === "kit-tag" ? "is-active" : ""} onClick={() => chooseGroupBy("kit-tag")} disabled={kitMembershipBusy}>
                                <span className="proposal-sort-menu__check">{groupBy === "kit-tag" ? "✓" : ""}</span>
                                <span><strong>By kits tag</strong><small>Folder → kit → components.</small></span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {can("make_order") ? <button type="button" className="products-btn products-btn--dark proposal-make-order-btn" onClick={openMakeOrder} disabled={!enrichedRows.length}><ProposalIcon name="shoppingBag" /><span>Make order</span></button> : null}
                      </div>
                    </header>
                  )}

                  {!createMode && !detailEdit ? (
                    <div className="proposal-classic-detail-title">
                      <span className="proposal-create-title-pill"><span>{proposal?.name || "Proposal"}</span></span>
                      <p>Created by {proposal?.createdBy || "Unknown"} · Updated {formatDate(proposal?.updatedAt || proposal?.createdAt)}</p>
                    </div>
                  ) : null}

                  {!createMode && proposal?.combinedSources?.length ? (
                    <div className="proposal-view-note">
                      <span aria-hidden="true">◎</span>
                      <span>{proposal.combineNote || `Combined from ${proposal.combinedSources.map((source) => source.name || source.id).join(", ")} using ${combineLogicLabel(proposal.combineLogic)} logic.`}</span>
                    </div>
                  ) : null}

                  {detailEdit ? (
                    <>
                      <div className={`proposal-name-edit-block proposal-name-edit-block--footer-save ${createMode ? "proposal-name-edit-block--create proposal-name-edit-block--proposal-create" : "proposal-name-edit-block--proposal-edit"}`}>
                        <label className="products-field products-field--wide">
                          <span>Proposal name <em>*</em></span>
                          <input
                            value={editName}
                            disabled={!createMode && !can("edit")}
                            onChange={(event) => {
                              setEditName(event.target.value);
                              setDraftErrors((current) => ({ ...current, name: "" }));
                            }}
                            placeholder="Example: School supplies quotation"
                            autoComplete="off"
                          />
                        </label>
                        {draftErrors.name ? <div className="direct-create-inline-error">{draftErrors.name}</div> : null}
                      </div>

                      <div className="products-proposal-tools proposals-one-tool">
                        <div className="products-proposal-tool-card proposal-add-components-tool-card">
                          {(createMode || can("item_add")) ? <button type="button" className="products-proposal-tool-title proposal-add-components-launch" onClick={() => setAddDialog(true)}>
                            <span aria-hidden="true">＋</span><span>Add proposal components</span>
                          </button> : null}
                          {!createMode ? (
                            <div className="proposal-classic-inline-actions proposal-classic-inline-actions--delete-only">
                              {can("delete") ? <button type="button" className="products-btn next-proposals-classic-danger" onClick={() => deleteProposal(proposal)}>Delete Proposal</button> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {draftErrors.items ? <div className="direct-create-inline-error direct-create-inline-error--items">{draftErrors.items}</div> : null}
                    </>
                  ) : (
                    <div className="proposal-view-note"><span aria-hidden="true">◉</span><span>View only. Choose Edit to modify this proposal.</span></div>
                  )}

                  <div className="products-proposal-table-card proposal-components-card">
                    <div className="products-proposal-table-head">
                      <div><h3>Proposal components</h3><p>Saved products and quantities for this proposal.</p></div>
                      <span>{formatNumber(enrichedRows.length)} item{enrichedRows.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="products-proposal-table-wrap proposal-components-wrap">
                      <div className="proposal-components-groups">
                        {groupBy === "kit-tag" ? (
                          kitGroupedVisibleRows.map((folder) => (
                            <section className="proposal-kit-folder-group" key={`${folder.id || "unfiled"}-${folder.label}`}>
                              <div className="proposal-kit-folder-group__head">
                                <div><span>Kit folder</span><strong>{folder.label}</strong></div>
                                <em>{folder.kits.length} kit{folder.kits.length === 1 ? "" : "s"}</em>
                              </div>
                              <div className="proposal-kit-folder-group__body">
                                {folder.kits.map((kit) => (
                                  <div className="proposal-kit-group" key={`${kit.id || "unassigned"}-${kit.label}`}>
                                    <div className="proposal-kit-group__head">
                                      <div><span>Kit</span><strong>{kit.label}</strong></div>
                                      <em>{kit.rows.length} item{kit.rows.length === 1 ? "" : "s"}</em>
                                    </div>
                                    <div className="proposal-components-grid">
                                      {kit.rows.map((row) => renderComponentCard(row, proposal))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ))
                        ) : (
                          componentGroupedVisibleRows.map((group) => (
                            <section className="proposal-component-group" key={group.label}>
                              <div className="proposal-component-group__head">
                                <div><span>Component tag</span><strong>{group.label}</strong></div>
                                <em>{group.rows.length} item{group.rows.length === 1 ? "" : "s"}</em>
                              </div>
                              <div className="proposal-components-grid">
                                {group.rows.map((row) => renderComponentCard(row, proposal))}
                              </div>
                            </section>
                          ))
                        )}
                        {!visibleEnrichedRows.length ? <div className="products-table-empty proposal-components-empty">{enrichedRows.length ? "No components match your search." : <>No components yet. {detailEdit ? "Add a product or saved kit above." : "Choose Edit to add components."}</>}</div> : null}
                      </div>
                    </div>
                    <div className="proposal-total-block">
                      <div><span>Components</span><strong>{formatNumber(detailTotals.items)}</strong></div>
                      <div><span>Total Quantity</span><strong>{formatNumber(detailTotals.quantity)}</strong></div>
                      <div><span>Estimated Total</span><strong>{formatMoney(detailTotals.value)}</strong></div>
                    </div>
                  </div>

                  {detailEdit ? (
                    <div className={`direct-create-save-footer proposal-create-save-footer ${createMode ? "direct-create-save-footer--create" : "direct-create-save-footer--edit"}`}>
                      <button type="button" className="products-btn products-btn--light direct-create-cancel-btn" onClick={backToProposals} disabled={busy}>Cancel</button>
                      {(createMode || can("edit")) ? <button type="button" className="products-btn products-btn--dark direct-create-save-btn" onClick={saveProposal} disabled={busy}>
                        <span>{busy ? "Saving…" : createMode ? "Save" : "Save Changes"}</span>
                      </button> : null}
                    </div>
                  ) : null}

                </>
              )}
            </section>
          </section>
        </section>

        {addDialog && proposal && (createMode || can("item_add")) ? <AddItemsModal proposal={proposal} products={products} kits={kits} kitFolders={kitFolders} tags={tags} busy={busy} onClose={() => setAddDialog(false)} onSubmit={submitAdd} /> : null}

        {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.proposal?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
        {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
      </main>
    );
  }

  /* ERP_PROPOSALS_KITS_PARITY_V2: multiple proposal actions, same workflow as Kits. */
  const beginProposalSelection = (proposal) => {
    setFolderMenu(""); setProposalSelectMode(true); setSelectedProposalIds([proposal.id]);
  };
  const toggleProposalSelection = (id) => {
    setFolderMenu("");
    setSelectedProposalIds((ids) => ids.includes(id) ? ids.filter((i) => i !== id) : [...ids,id]);
  };
  const exitProposalSelection = () => {
    setFolderMenu(""); setProposalSelectMode(false); setSelectedProposalIds([]);
  };
  const startProposalBatchMove = () => {
    const items=proposals.filter((p) => selectedProposalIds.includes(p.id));
    if (!items.length || !can("edit")) return;
    setFolderMenu("");
    setMoveDialog({ proposal: { ...items[0], name: `${items.length} selected proposals` }, bulkIds: items.map((p) => p.id) });
  };
  const runProposalBatch = async (action, options = {}) => {
    if (busy || proposalBatchRunning.current) return false;
    const ids=options.ids || selectedProposalIds;
    const targets=proposals.filter((p) => ids.includes(p.id));
    if (!targets.length) return false;
    const permitted = action === "move" ? can("edit") : action === "copy" ? can("copy") : action === "delete" ? can("delete") : action === "edit" ? can("item_add") : false;
    if (!permitted) { notify("You do not have permission for this action.","error"); return false; }
    if (action === "edit" && (!options.productId || !Number.isInteger(Number(options.quantity)) || Number(options.quantity)<1)) {
      notify("Select a component and a valid quantity.","error"); return false;
    }
    if (action === "move" && text(options.folderId) && !folders.some((f) => f.id === text(options.folderId))) {
      notify("Choose an existing folder.","error"); return false;
    }
    let adminPassword="";
    if (action !== "copy" && targets.some((p) => !p.canEdit)) {
      adminPassword=await askPassword({ title:"Admin password required", message:`Enter the Admin password to ${action} ${targets.length} proposals created by other users.` });
      if (adminPassword === null) return false;
    }
    if (action === "delete") {
      const confirmed=await confirmDelete({ itemName:`${targets.length} selected proposals`, itemType:"proposal", title:`Delete ${targets.length} proposals?`, message:`Permanently delete ${targets.length} selected proposals and their saved components? This cannot be undone.`, confirmLabel:`Delete ${targets.length} Proposals` });
      if (!confirmed) return false;
    }
    proposalBatchRunning.current=true; setBusy(true); setFolderMenu("");
    const failures=[]; let succeeded=0;
    try {
      for (const proposal of targets) {
        try {
          if (action === "move") {
            if (proposal.folderId !== text(options.folderId)) {
              const response=await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}`, { method:"PATCH", body:JSON.stringify({ name:proposal.name, folderId:text(options.folderId), adminPassword }) });
              syncProposal(response.proposal || { ...proposal,folderId:text(options.folderId) });
            }
          } else if (action === "copy") {
            const response=await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}/copy`, { method:"POST", body:JSON.stringify({ name:`${proposal.name} Copy` }) });
            if (response.proposal) syncProposal(response.proposal);
          } else if (action === "delete") {
            await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}`, { method:"DELETE", body:JSON.stringify({ adminPassword }) });
            setProposals((list) => list.filter((p) => p.id!==proposal.id));
          } else if (action === "edit") {
            // Existing add-item endpoint ADDS this quantity; does not overwrite the proposal.
            await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}/items`, { method:"POST", body:JSON.stringify({productId:options.productId,quantity:Number(options.quantity),mergeLogic:"add",adminPassword}) });
          }
          succeeded++;
        } catch (error) { failures.push({id:proposal.id,name:proposal.name,reason:error?.message || "Request failed"}); }
      }
      try {
        const result=await requestJson(`/next/api/products/proposals?_fresh=1&_ts=${Date.now()}`);
        if (Array.isArray(result.proposals)) setProposals(result.proposals.map(normalizeProposal));
      } catch (refreshError) { notify("Changes saved, but refresh failed. Reload to see the latest proposals.","error"); }
      if (failures.length) {
        setSelectedProposalIds(failures.map((f) => f.id));
        notify(`${succeeded} completed; ${failures.length} failed. ${failures.slice(0,2).map((f) => `${f.name}: ${f.reason}`).join(" | ")}`,"error");
      } else {
        exitProposalSelection();
        notify(`${succeeded} proposal${succeeded === 1 ? "" : "s"} ${action === "copy" ? "copied" : action === "move" ? "moved" : action === "edit" ? "updated" : "deleted"}.`);
      }
      return !failures.length;
    } finally { proposalBatchRunning.current=false; setBusy(false); }
  };

  return (
    <main className="products-shell proposals-shell next-proposals-classic-parity">
      <Toast toast={toast} onClose={() => setToast(null)} />


      {activeFolder ? <HeaderFolderBreadcrumb segments={[
        { label: "Proposals", icon: "folder", onClick: () => { setActiveFolder(null); setSearch(""); setFolderMenu(""); setProposalSelectMode(false); setSelectedProposalIds([]); } },
        ...proposalFolderPath(activeFolder, folders).map((folder) => ({
          label: folder.name, icon: "folder-check", onClick: () => openProposalFolder(folder),
        })),
      ]}/> : null}

      <section className="products-proposals-view proposals-workspace proposals-folders-card proposal-library-page" aria-live="polite">
        <section className="proposals-panel">
          {proposalSelectMode ? (
            <div className="kit-bulk-toolbar kit-bulk-toolbar--compact" role="group" aria-label="Multi-select Proposals. Long-press a selected Proposal for actions.">
              <div className="kit-bulk-toolbar__label"><ProposalIcon name="grid"/><span>{selectedProposalIds.length} selected</span></div>
              <div className="kit-bulk-toolbar__controls">
                <button type="button" onClick={() => setSelectedProposalIds(filteredProposals.map((p) => p.id))} disabled={busy}>Select all</button>
                <button type="button" onClick={exitProposalSelection} disabled={busy}>Done</button>
              </div>
            </div>
          ) : null}
          <div className="products-proposals-list">
            {(filteredProposalFolders.length || filteredProposals.length || can("create")) ? (
              <div className="products-proposal-folders kit-library-grid kit-library-grid--root proposal-library-grid">
                {can("create") ? (
                  <div className="kit-quick-create kit-quick-create--folder">
                    <button type="button" className="kit-quick-create__tile" onClick={() => {
                      setFolderMenu(""); setFolderDialog({ mode: "create", value: "" });
                    }} aria-label="Create Folder">
                      <span className="kit-quick-create__illustration" aria-hidden="true">
                        <ProposalIcon name="folderPlus" size={39}/>
                      </span>
                      <strong>Create Folder</strong><small>Add a new folder</small>
                    </button>
                  </div>
                ) : null}
                {canCreate ? (
                  <div className="kit-quick-create kit-quick-create--kit">
                    <button type="button" className="kit-quick-create__tile" onClick={() => {
                      setFolderMenu(""); startCreateProposal();
                    }} aria-label="Create Proposal">
                      <span className="kit-quick-create__illustration" aria-hidden="true">
                        <ProposalIcon name="file" size={39}/>
                      </span>
                      <strong>Create Proposal</strong><small>Add a new proposal</small>
                    </button>
                  </div>
                ) : null}
                {filteredProposalFolders.map((folder) => {
                  const key = `folder:${folder.id}`;
                  const menuOpen = folderMenu === key;
                  const proposalCount = folderProposalCounts.get(folder.id) || 0;
                  const childCount = folderChildCounts.get(folder.id) || 0;
                  return (
                    <article className={`products-proposal-folder proposal-library-folder kit-library-folder ${menuOpen ? "is-menu-open" : ""}`} key={folder.id}>
                      {menuOpen && can("edit") ? (
                        <ProposalModernActionMenu title="Folder actions">
                          <button type="button" onClick={() => { setFolderMenu(""); renameProposalFolder(folder); }}><ProposalIcon name="edit" /><span>Rename</span></button>
                          <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); deleteProposalFolder(folder); }}><ProposalIcon name="trash" /><span>Delete folder</span></button>
                        </ProposalModernActionMenu>
                      ) : null}
                      <button
                        type="button"
                        className="products-proposal-folder__main products-proposal-folder__main--long-press"
                        onPointerDown={(event) => startFolderLongPress(event, key)}
                        onPointerMove={moveFolderLongPress}
                        onPointerUp={cancelFolderLongPress}
                        onPointerCancel={cancelFolderLongPress}
                        onPointerLeave={cancelFolderLongPress}
                        onContextMenu={(event) => {
                          event.preventDefault(); cancelFolderLongPress();
                          suppressFolderClickRef.current = true; setFolderMenu(key);
                        }}
                        onKeyDown={(event) => openFolderActionsFromKeyboard(event, key)}
                        onClick={() => {
                          if (suppressFolderClickRef.current) { suppressFolderClickRef.current = false; return; }
                          openProposalFolder(folder);
                        }}
                        aria-label={`Open folder ${folder.name}. Press and hold for actions.`}
                        aria-haspopup="menu" aria-expanded={menuOpen}
                      >
                        <span className="proposal-folder-figure" aria-hidden="true">
                          <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left"/>
                          <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle"/>
                          <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right"/>
                          <span className="proposal-folder-figure__back"/>
                          <span className="proposal-folder-figure__front"><small>F</small></span>
                        </span>
                        <span className="proposal-folder-copy"><strong>{folder.name}</strong><em>Proposal folder</em></span>
                        <span className="proposal-folder-count"><ProposalIcon name="folder" size={14}/><span>
                          {proposalCount} proposal{proposalCount === 1 ? "" : "s"}
                          {childCount ? ` · ${childCount} folder${childCount === 1 ? "" : "s"}` : ""}
                        </span></span>
                      </button>
                    </article>
                  );
                })}
                {filteredProposals.map((proposal) => {
                  const menuOpen = folderMenu === `proposal:${proposal.id}`;
                  const selected = selectedProposalIds.includes(proposal.id);
                  return (
                  <article className={`products-proposal-folder kit-library-kit ${menuOpen ? "is-menu-open" : ""} ${proposalSelectMode ? "kit-bulk-selectable" : ""} ${selected ? "kit-bulk-selected" : ""}`} key={proposal.id}>
                    {proposalSelectMode ? <span className="kit-bulk-selection-indicator" aria-hidden="true">{selected ? "✓" : ""}</span> : null}
                    {menuOpen && (proposalSelectMode || can("edit") || can("copy") || can("delete") || can("item_add") || can("item_edit") || can("item_delete")) ? (
                      <ProposalModernActionMenu title={proposalSelectMode ? `${selectedProposalIds.length} proposals selected` : "Proposal actions"}>
                        {!proposalSelectMode && (can("edit") || can("copy") || can("delete") || can("item_add")) ? <button type="button" onClick={() => beginProposalSelection(proposal)}><ProposalIcon name="grid" /><span>Select</span></button> : null}
                        {!proposalSelectMode && (can("edit") || can("item_add") || can("item_edit") || can("item_delete")) ? <button type="button" onClick={() => {setFolderMenu(""); enterEditProposal(proposal);}}><ProposalIcon name="edit" /><span>Edit</span></button> : null}
                        {!proposalSelectMode && can("edit") ? <button type="button" onClick={() => { setFolderMenu(""); moveProposal(proposal); }}><ProposalIcon name="move" /><span>Move</span></button> : null}
                        {!proposalSelectMode && can("copy") ? <button type="button" onClick={() => { setFolderMenu(""); setNameDialog({ mode: "copy", proposal, value: `${proposal.name} Copy` }); }}><ProposalIcon name="copy" /><span>Make a copy</span></button> : null}
                        {!proposalSelectMode && can("delete") ? <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); deleteProposal(proposal); }}><ProposalIcon name="trash" /><span>Delete</span></button> : null}
                        {proposalSelectMode && can("item_add") && selectedProposalIds.length ? <button type="button" onClick={() => {setFolderMenu("");setBulkEditOpen(true);}}><ProposalIcon name="edit" /><span>Edit · Add component</span></button> : null}
                        {proposalSelectMode && can("edit") && selectedProposalIds.length ? <button type="button" onClick={startProposalBatchMove}><ProposalIcon name="move" /><span>Move selected</span></button> : null}
                        {proposalSelectMode && can("copy") && selectedProposalIds.length ? <button type="button" onClick={() => runProposalBatch("copy")}><ProposalIcon name="copy" /><span>Make copies</span></button> : null}
                        {proposalSelectMode && can("delete") && selectedProposalIds.length ? <button type="button" className="is-danger" onClick={() => runProposalBatch("delete")}><ProposalIcon name="trash" /><span>Delete selected</span></button> : null}
                        {proposalSelectMode ? <button type="button" onClick={exitProposalSelection}><ProposalIcon name="arrowLeft" /><span>Exit selection</span></button> : null}
                      </ProposalModernActionMenu>
                    ) : null}
                    <button
                      type="button"
                      className="products-proposal-folder__main products-proposal-folder__main--long-press"
                      onPointerDown={(event) => startFolderLongPress(event, `proposal:${proposal.id}`)}
                      onPointerMove={moveFolderLongPress}
                      onPointerUp={cancelFolderLongPress}
                      onPointerCancel={cancelFolderLongPress}
                      onPointerLeave={cancelFolderLongPress}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        cancelFolderLongPress();
                        suppressFolderClickRef.current = true;
                        if (proposalSelectMode) setSelectedProposalIds((ids) => ids.includes(proposal.id) ? ids : [...ids,proposal.id]);
                        setFolderMenu(`proposal:${proposal.id}`);
                      }}
                      onKeyDown={(event) => openFolderActionsFromKeyboard(event, `proposal:${proposal.id}`)}
                      onClick={() => {
                        if (suppressFolderClickRef.current) {
                          suppressFolderClickRef.current = false;
                          return;
                        }
                        if (proposalSelectMode) { toggleProposalSelection(proposal.id); return; }
                        loadProposal(proposal.id);
                      }}
                      aria-label={proposalSelectMode ? `${selected ? "Deselect" : "Select"} ${proposal.name}. Long-press for actions.` : `Open ${proposal.name}. Press and hold for actions.`}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                    >
                      <span className="proposal-folder-figure" aria-hidden="true">
                        <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
                        <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
                        <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
                        <span className="proposal-folder-figure__back" />
                        <span className="proposal-folder-figure__front"><small>Q</small></span>
                      </span>
                      <span className="proposal-folder-copy"><strong>{proposal.name}</strong><em>Created by {proposal.createdBy || "—"}</em></span>
                      <span className="proposal-folder-count"><span aria-hidden="true">▱</span><span>{formatNumber(proposal.itemsCount)} item{proposal.itemsCount === 1 ? "" : "s"}</span></span>
                    </button>
                  </article>
                  );
                })}
              </div>
            ) : (
              <div className="products-proposals-empty">No folders or proposals match your search.</div>
            )}
          </div>
        </section>
      </section>

      {folderDialog ? <ProposalFolderNameModal key={`${folderDialog.mode}-${folderDialog.folder?.id || "new"}`} dialog={folderDialog} busy={busy} onClose={() => setFolderDialog(null)} onSubmit={submitProposalFolder} /> : null}
      {bulkEditOpen ? <BulkProposalEditModal count={selectedProposalIds.length} products={products} busy={busy} onClose={() => setBulkEditOpen(false)} onSubmit={async (productId,quantity) => { const ok=await runProposalBatch("edit",{productId,quantity}); if(ok) setBulkEditOpen(false); }} /> : null}
      {moveDialog ? <MoveProposalModal key={`move-${moveDialog.proposal?.id || "proposal"}`} dialog={moveDialog} folders={folders.map((folder) => ({ ...folder, proposalCount: folderProposalCounts.get(folder.id) || 0 }))} busy={busy} onClose={() => setMoveDialog(null)} onSubmit={submitMoveProposal} /> : null}
      {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.proposal?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
      {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
    </main>
  );
}
