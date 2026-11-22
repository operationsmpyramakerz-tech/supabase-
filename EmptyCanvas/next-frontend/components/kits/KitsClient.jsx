"use client";

import HeaderFolderBreadcrumb from "../HeaderFolderBreadcrumb";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import SaveProgressModal, { useSaveProgress } from "../SaveProgressModal";
import ActionLoadingModal, { useActionLoading } from "../ActionLoadingModal";
import { confirmDelete } from "../../lib/client-confirm";
import { featureAllowed } from "../../lib/feature-permissions-registry";

const KitDownloadModal = dynamic(() => import("./KitDialogs").then((module) => module.KitDownloadModal), { ssr: false });
const SendKitToStockModal = dynamic(() => import("./KitDialogs").then((module) => module.SendKitToStockModal), { ssr: false });
const NameModal = dynamic(() => import("./KitDialogs").then((module) => module.NameModal), { ssr: false });
const FolderNameModal = dynamic(() => import("./KitDialogs").then((module) => module.FolderNameModal), { ssr: false });
const MoveKitModal = dynamic(() => import("./KitDialogs").then((module) => module.MoveKitModal), { ssr: false });
const PasswordModal = dynamic(() => import("./KitDialogs").then((module) => module.PasswordModal), { ssr: false });
const AddProductModal = dynamic(() => import("./KitDialogs").then((module) => module.AddProductModal), { ssr: false });
const BulkKitEditModal = dynamic(() => import("./KitDialogs").then((module) => module.BulkKitEditModal), { ssr: false });

const EXPORT_COLUMNS = [
  ["idCode", "ID Code"],
  ["name", "Component"],
  ["quantity", "Quantity"],
  ["unitPrice", "Unit Cost"],
  ["totalPrice", "Total Cost"],
];

// Keep the lightweight value helpers local to the Kits client. These were
// accidentally dropped during the Kits/Proposals split, which caused the page
// to throw a ReferenceError as soon as the initial catalog was normalized.
function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

// ERP_KITS_ALPHABETICAL_SORT_V1: natural, case-insensitive name order.
// Kept pure so filtering, selection, kit ownership and server data are unchanged.
const kitsAlphabeticalCollator = new Intl.Collator(undefined, {
  usage: "sort", sensitivity: "base", numeric: true, ignorePunctuation: true,
});
function compareKitsAlphabetically(a, b) {
  return kitsAlphabeticalCollator.compare(text(a?.name), text(b?.name));
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

function normalizedUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
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

const FEATHER_PATHS = {
  briefcase: [
    <rect key="r" x="3" y="7" width="18" height="13" rx="2" ry="2" />,
    <path key="p1" d="M8 21V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v16" />,
    <path key="p2" d="M3 11h18" />,
  ],
  edit: [
    <path key="p1" d="M12 20h9" />,
    <path key="p2" d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  ],
  copy: [
    <rect key="r" x="9" y="9" width="13" height="13" rx="2" ry="2" />,
    <path key="p" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />,
  ],
  trash: [
    <polyline key="pl" points="3 6 5 6 21 6" />,
    <path key="p1" d="M19 6l-1 14H6L5 6" />,
    <path key="p2" d="M10 11v6M14 11v6M9 6V4h6v2" />,
  ],
  arrowLeft: [<line key="l" x1="19" y1="12" x2="5" y2="12" />, <polyline key="p" points="12 19 5 12 12 5" />],
  plusCircle: [<circle key="c" cx="12" cy="12" r="10" />, <path key="p" d="M12 8v8M8 12h8" />],
  plus: [<path key="p" d="M12 5v14M5 12h14" />],
  minus: [<path key="p" d="M5 12h14" />],
  chevronDown: [<polyline key="p" points="6 9 12 15 18 9" />],
  search: [<circle key="c" cx="11" cy="11" r="8" />, <line key="l" x1="21" y1="21" x2="16.65" y2="16.65" />],
  externalLink: [
    <path key="p1" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
    <polyline key="p2" points="15 3 21 3 21 9" />,
    <line key="l" x1="10" y1="14" x2="21" y2="3" />,
  ],
  save: [
    <path key="p1" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />,
    <polyline key="p2" points="17 21 17 13 7 13 7 21" />,
    <polyline key="p3" points="7 3 7 8 15 8" />,
  ],
  eye: [<path key="p" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />, <circle key="c" cx="12" cy="12" r="3" />],
  merge: [<circle key="c1" cx="18" cy="18" r="3" />, <circle key="c2" cx="6" cy="6" r="3" />, <path key="p" d="M6 21V9a9 9 0 0 0 9 9" />],
  move: [
    <polyline key="p1" points="5 9 2 12 5 15" />,
    <polyline key="p2" points="9 5 12 2 15 5" />,
    <polyline key="p3" points="15 19 12 22 9 19" />,
    <polyline key="p4" points="19 9 22 12 19 15" />,
    <line key="l1" x1="2" y1="12" x2="22" y2="12" />,
    <line key="l2" x1="12" y1="2" x2="12" y2="22" />,
  ],
  folder: [<path key="p" d="M3 5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />],
  folderPlus: [<path key="p1" d="M3 5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />, <path key="p2" d="M12 10v6M9 13h6" />],
  download: [<path key="p1" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />, <polyline key="p2" points="7 10 12 15 17 10" />, <line key="l" x1="12" y1="15" x2="12" y2="3" />],
  archive: [<polyline key="p1" points="21 8 21 21 3 21 3 8" />, <rect key="r" x="1" y="3" width="22" height="5" rx="1" />, <line key="l" x1="10" y1="12" x2="14" y2="12" />],
  file: [<path key="p1" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />, <polyline key="p2" points="14 2 14 8 20 8" />, <line key="l1" x1="8" y1="13" x2="16" y2="13" />, <line key="l2" x1="8" y1="17" x2="16" y2="17" />],
  grid: [<rect key="r1" x="3" y="3" width="7" height="7" rx="1" />, <rect key="r2" x="14" y="3" width="7" height="7" rx="1" />, <rect key="r3" x="3" y="14" width="7" height="7" rx="1" />, <rect key="r4" x="14" y="14" width="7" height="7" rx="1" />],
  sort: [<line key="l1" x1="3" y1="6" x2="21" y2="6" />, <line key="l2" x1="6" y1="12" x2="18" y2="12" />, <line key="l3" x1="10" y1="18" x2="14" y2="18" />],
};

function FeatherIcon({ name, size = 18, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {FEATHER_PATHS[name] || FEATHER_PATHS.briefcase}
    </svg>
  );
}

function firstTag(product) {
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  return tags.map(text).find(Boolean) || "Uncategorized";
}

function normalizeProduct(product, index = 0) {
  return {
    id: text(product?.id) || `product-${index}`,
    name: text(product?.name) || "Untitled product",
    displayId: text(product?.displayId || product?.idCode || product?.id_code),
    unitPrice: product?.unitPrice === null || typeof product?.unitPrice === "undefined" ? null : number(product.unitPrice),
    unit: text(product?.unit),
    url: normalizedUrl(product?.url),
    attachments: Array.isArray(product?.attachments)
      ? product.attachments.filter((file) => file?.url && file?.name).map((file) => ({
          name: text(file.name), url: text(file.url), size: Number(file.size) || 0,
        }))
      : [],
    imageUrl: normalizedUrl(product?.imageUrl),
    tags: Array.isArray(product?.tags) ? product.tags.map(text).filter(Boolean) : [],
  };
}

function normalizeKit(kit, index = 0) {
  return {
    id: text(kit?.id) || `kit-${index}`,
    name: text(kit?.name) || "Untitled kit",
    createdBy: text(kit?.createdBy),
    createdById: text(kit?.createdById),
    createdAt: text(kit?.createdAt),
    updatedAt: text(kit?.updatedAt),
    folderId: text(kit?.folderId || kit?.folder_id),
    itemsCount: number(kit?.itemsCount),
    canEdit: kit?.canEdit === true,
  };
}

function normalizeFolder(folder, index = 0) {
  return {
    id: text(folder?.id) || `folder-${index}`,
    name: text(folder?.name) || "Untitled folder",
    createdBy: text(folder?.createdBy),
    createdById: text(folder?.createdById),
    createdAt: text(folder?.createdAt),
    updatedAt: text(folder?.updatedAt),
    parentFolderId: text(folder?.parentFolderId ?? folder?.parent_folder_id),
    canEdit: folder?.canEdit === true,
  };
}

/* ERP_KITS_NESTED_FOLDERS_V3: resolve a folder's path without recursing into cyclic data. */
function kitFolderPath(folder, allFolders) {
  const byId = new Map(allFolders.map((item) => [item.id, item]));
  const visited = new Set();
  const result = [];
  let node = folder?.id ? (byId.get(folder.id) || folder) : null;
  while (node?.id && !visited.has(node.id) && result.length < 100) {
    visited.add(node.id);
    result.push(node);
    node = byId.get(node.parentFolderId) || null;
  }
  return result.reverse();
}

function normalizeItem(item, index = 0) {
  return {
    id: text(item?.id) || `item-${index}`,
    kitId: text(item?.kitId),
    productId: text(item?.productId),
    productName: text(item?.productName) || "Untitled product",
    quantity: Math.max(1, Math.round(number(item?.quantity) || 1)),
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
  if (!response.ok || body?.ok === false) throw new Error(apiErrorMessage(body, "The request failed."));
  return body;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-proposals-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "Kits"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

/* ERP_KITS_CREATE_PERMISSIONS_MODERN_MENU_V1
   Portaled action menu: escapes animated folder containers and is clamped to the viewport.
   Used only on Kits folder/kit long-press menus. */
function KitModernActionMenu({ title, children }) {
  const [placement, setPlacement] = useState(null);

  useEffect(() => {
    const items = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0);
    const predictedHeight = 48 + items * 48 + 10;
    let raf = 0;
    const position = () => {
      const anchor = document.querySelector(".next-kits-classic-parity .kit-library-grid > .products-proposal-folder.is-menu-open");
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

export default function KitsClient({ account, initialCatalog, initialKits, initialFolders, bootstrapWarnings = [] }) {
  const can = (action) => featureAllowed(account, `kits.${action}`);
  // Creation must be able to save its components as well as its header.
  const canCreate = can("create") && can("item_add");
  const [products, setProducts] = useState(() => (Array.isArray(initialCatalog?.products) ? initialCatalog.products : []).map(normalizeProduct));
  const [kits, setKits] = useState(() => (Array.isArray(initialKits?.kits) ? initialKits.kits : []).map(normalizeKit));
  const [folders, setFolders] = useState(() => (Array.isArray(initialFolders?.folders) ? initialFolders.folders : []).map(normalizeFolder));
  const [activeFolder, setActiveFolder] = useState(null);
  const [activeDetail, setActiveDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [exportColumns, setExportColumns] = useState(() => EXPORT_COLUMNS.map(([key]) => key));
  const [groupBy, setGroupBy] = useState("component-tag");
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sendToStockOpen, setSendToStockOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { saveProgress, startSaveProgress, updateSaveProgress, finishSaveProgress } = useSaveProgress();
  const { actionLoading, startActionLoading, finishActionLoading } = useActionLoading();
  const [detailBusy, setDetailBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null);
  const [moveDialog, setMoveDialog] = useState(null);
  const [passwordRequest, setPasswordRequest] = useState(null);
  const [folderMenu, setFolderMenu] = useState("");
  // ERP_KITS_MULTI_SELECT_ACTIONS_V1: selection is limited to the visible Kits level.
  const [kitSelectMode, setKitSelectMode] = useState(false);
  const [selectedKitIds, setSelectedKitIds] = useState([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const bulkRunningRef = useRef(false);
  const folderLongPressTimerRef = useRef(null);
  const folderLongPressStartRef = useRef(null);
  const suppressFolderClickRef = useRef(false);
  const [detailEdit, setDetailEdit] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [draftErrors, setDraftErrors] = useState({ name: "", items: "" });
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productQty, setProductQty] = useState(1);
  const passwordResolver = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = search;
    input.placeholder = activeDetail ? "Search components..." : activeFolder ? `Search kits in ${activeFolder.name}...` : "Search folders or kits...";
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.placeholder = "Search";
    };
  }, [activeDetail?.kit?.id, activeFolder?.id]);

  useEffect(() => {
    const open = Boolean(activeDetail || detailBusy);
    document.body.classList.toggle("proposal-detail-open", open);
    return () => document.body.classList.remove("proposal-detail-open");
  }, [activeDetail, detailBusy]);

  useEffect(() => {
    const close = (event) => {
      if (!event.target.closest(".products-proposal-folder") && !event.target.closest(".kit-modern-action-popover")) setFolderMenu("");
      if (pickerRef.current && !pickerRef.current.contains(event.target)) setProductPickerOpen(false);
      if (!event.target.closest(".proposal-download-menu-wrap") && !event.target.closest(".proposal-download-modal")) setDownloadMenuOpen(false);
      if (!event.target.closest(".proposal-sort-menu-wrap")) setSortMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setFolderMenu("");
      setProductPickerOpen(false);
      setDownloadMenuOpen(false);
      setSortMenuOpen(false);
      setKitSelectMode(false);
      setSelectedKitIds([]);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
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
      if (kitSelectMode && itemKey.startsWith("kit:")) {
        const id = itemKey.slice(4);
        setSelectedKitIds((current) => current.includes(id) ? current : [...current, id]);
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

  const folderKitCounts = useMemo(() => {
    const counts = new Map();
    kits.forEach((kit) => {
      if (kit.folderId) counts.set(kit.folderId, (counts.get(kit.folderId) || 0) + 1);
    });
    return counts;
  }, [kits]);

  const filteredKits = useMemo(() => {
    const needle = lower(search);
    const scoped = activeFolder
      ? kits.filter((kit) => kit.folderId === activeFolder.id)
      : kits.filter((kit) => !kit.folderId);
    return scoped
      .filter((kit) => !needle || [kit.name, kit.createdBy].some((value) => lower(value).includes(needle)))
      .sort(compareKitsAlphabetically);
  }, [kits, search, activeFolder]);

  const filteredFolders = useMemo(() => {
    const needle = lower(search);
    const parentId = activeFolder?.id || "";
    return folders
      .filter((folder) => folder.parentFolderId === parentId &&
        (!needle || [folder.name, folder.createdBy].some((value) => lower(value).includes(needle))))
      .sort(compareKitsAlphabetically);
  }, [folders, search, activeFolder]);

  const nestedFolderCounts = useMemo(() => {
    const counts = new Map();
    folders.forEach((folder) => {
      if (folder.parentFolderId) counts.set(folder.parentFolderId, (counts.get(folder.parentFolderId) || 0) + 1);
    });
    return counts;
  }, [folders]);

  const filteredProducts = useMemo(() => {
    const needle = lower(productSearch);
    return products
      .filter((product) => !needle || [product.name, product.displayId, product.unit, firstTag(product)].some((value) => lower(value).includes(needle)))
      .slice(0, 120);
  }, [products, productSearch]);

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
    });
  }, [activeDetail, productMap]);

  const visibleEnrichedRows = useMemo(() => {
    const needle = lower(search);
    if (!activeDetail || !needle) return enrichedRows;
    return enrichedRows.filter((row) => lower(row.name).includes(needle));
  }, [activeDetail, enrichedRows, search]);

  const componentGroupedVisibleRows = useMemo(() => {
    const groups = new Map();
    for (const row of visibleEnrichedRows) {
      const label = text(row.tag) || "Uncategorized";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    }
    return [...groups.entries()]
      .map(([label, rows]) => ({ label, rows: rows.slice().sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleEnrichedRows]);

  const kitGroupedVisibleRows = useMemo(() => {
    const kit = activeDetail?.kit;
    if (!kit) return [];
    const folder = folders.find((entry) => entry.id === kit.folderId);
    return [{
      id: folder?.id || "",
      label: folder?.name || "Unfiled Kits",
      kits: [{
        id: kit.id,
        label: kit.name || "Kit",
        rows: visibleEnrichedRows.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }],
    }];
  }, [activeDetail, folders, visibleEnrichedRows]);

  const detailTotals = useMemo(() => enrichedRows.reduce((acc, row) => {
    acc.items += 1;
    acc.quantity += row.quantity;
    if (Number.isFinite(Number(row.totalPrice))) acc.value += Number(row.totalPrice);
    return acc;
  }, { items: 0, quantity: 0, value: 0 }), [enrichedRows]);

  const selectedProduct = selectedProductId ? productMap.get(selectedProductId) : null;

  const notify = (message, type = "success", title = "Kits") => {
    setToast({ message, type, title });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 4500);
  };

  const syncKit = (kit) => {
    const normalized = normalizeKit(kit);
    setKits((current) => {
      const exists = current.some((item) => item.id === normalized.id);
      return exists ? current.map((item) => item.id === normalized.id ? normalized : item) : [normalized, ...current];
    });
    setActiveDetail((current) => current?.kit?.id === normalized.id ? { ...current, kit: normalized } : current);
    return normalized;
  };

  const setDetailFromBody = (body) => {
    const kit = normalizeKit(body?.kit || {});
    const items = (Array.isArray(body?.items) ? body.items : []).map(normalizeItem);
    setActiveDetail({ kit, items });
    setEditName(kit.name || "");
    setKits((current) => current.map((entry) => entry.id === kit.id ? { ...kit, itemsCount: items.length } : entry));
    return { kit, items };
  };

  const resetDetailEditor = () => {
    setDetailEdit(false);
    setCreateMode(false);
    setEditAdminPassword("");
    setEditName("");
    setDraftErrors({ name: "", items: "" });
    setProductPickerOpen(false);
    setProductSearch("");
    setSelectedProductId("");
    setProductQty(1);
  };

  const backToKits = () => {
    setActiveDetail(null);
    setSearch("");
    setDownloadMenuOpen(false);
    setSortMenuOpen(false);
    setSendToStockOpen(false);
    resetDetailEditor();
  };

  const toggleExportColumn = (key) => {
    setExportColumns((current) => current.includes(key)
      ? (current.length === 1 ? current : current.filter((item) => item !== key))
      : [...current, key]);
  };

  const chooseGroupBy = (mode) => {
    setGroupBy(mode === "kit-tag" ? "kit-tag" : "component-tag");
    setSortMenuOpen(false);
  };

  const downloadKit = (type) => {
    const kit = activeDetail?.kit;
    if (!kit?.id) return;
    const columns = exportColumns.length ? exportColumns.join(",") : EXPORT_COLUMNS.map(([key]) => key).join(",");
    const params = new URLSearchParams({ columns, groupBy });
    openDownload(`/next/api/products/export-direct?scope=kit&id=${encodeURIComponent(kit.id)}&kind=${encodeURIComponent(type)}&${params.toString()}`);
    setDownloadMenuOpen(false);
  };

  const openSendToStock = () => {
    setDownloadMenuOpen(false);
    setSortMenuOpen(false);
    setSendToStockOpen(true);
    requestJson(`/next/api/team-members?_fresh=1&_ts=${Date.now()}`)
      .then((body) => setMembers(normalizeUsersCenterMembers(body)))
      .catch((error) => notify(error?.message || "Users Center members could not be refreshed.", "error"));
  };

  const sendKitToStock = async ({ teamMemberId, receiptNumber, files = [] }) => {
    const kit = activeDetail?.kit;
    if (!kit?.id) throw new Error("Kit ID is missing.");
    setBusy(true);
    startActionLoading({ title: "Sending to stock", message: "Uploading receipt images and adding Stocktaking rows…" });
    try {
      const { prepareReceiptImage } = await import("../../lib/receipt-image-client");
      const receipts = [];
      for (const file of files) {
        const prepared = await prepareReceiptImage(file);
        const uploaded = await requestJson("/next/api/products/proposals/receipt-upload", {
          method: "POST",
          body: JSON.stringify({ dataUrl: prepared.dataUrl, filename: prepared.name || file.name || "receipt.jpg" }),
        });
        if (uploaded?.url) receipts.push({ url: uploaded.url, name: uploaded.name || prepared.name || file.name || "Receipt" });
      }
      if (!receipts.length) throw new Error("No receipt images were uploaded.");

      const body = await requestJson(`/next/api/products/kits/send-to-stock?id=${encodeURIComponent(kit.id)}`, {
        method: "POST",
        body: JSON.stringify({ teamMemberId, receiptNumber: text(receiptNumber), receipts }),
      });
      const count = Number(body?.count || 0);
      const memberName = text(body?.member?.name) || "the selected user";
      await finishActionLoading("done", `${count} Stocktaking row${count === 1 ? "" : "s"} added to ${memberName}.`);
      setSendToStockOpen(false);
      notify(`Kit sent to ${memberName} Stocktaking under Main stock.`);
      return body;
    } catch (error) {
      await finishActionLoading("failed", error?.message || "The kit could not be sent to Stocktaking.");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const loadKit = async (kitId, options = {}) => {
    const edit = Boolean(options.edit);
    setSearch("");
    setFolderMenu("");
    setCreateMode(false);
    setDetailEdit(edit);
    if (Object.prototype.hasOwnProperty.call(options, "adminPassword")) setEditAdminPassword(options.adminPassword || "");
    setDetailBusy(true);
    try {
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kitId)}?_ts=${Date.now()}`);
      setDetailFromBody(body);
      setDraftErrors({ name: "", items: "" });
    } catch (error) {
      notify(error?.message || "The kit could not be loaded.", "error");
    } finally {
      setDetailBusy(false);
    }
  };

  const refreshKits = async () => {
    try {
      const [kitBody, productBody, folderBody] = await Promise.all([
        requestJson(`/next/api/products/kits?_fresh=1&_ts=${Date.now()}`),
        requestJson(`/next/api/products?_fresh=1&_ts=${Date.now()}`),
        requestJson(`/next/api/products/kit-folders?_fresh=1&_ts=${Date.now()}`),
      ]);
      setKits((kitBody.kits || []).map(normalizeKit));
      setProducts((productBody.products || []).map(normalizeProduct));
      setFolders((folderBody.folders || []).map(normalizeFolder));
    } catch (error) {
      notify(error?.message || "The data could not be refreshed.", "error");
    }
  };

  const openFolder = (folder) => {
    setFolderMenu("");
    setSearch("");
    setKitSelectMode(false);
    setSelectedKitIds([]);
    setActiveFolder(normalizeFolder(folder));
  };

  const backToFolderRoot = () => {
    setFolderMenu("");
    setSearch("");
    setKitSelectMode(false);
    setSelectedKitIds([]);
    setActiveFolder(null);
  };

  const submitFolderDialog = async (name) => {
    const dialog = folderDialog;
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.mode === "rename" && dialog.folder?.id) {
        const body = await requestJson(`/next/api/products/kit-folders/${encodeURIComponent(dialog.folder.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ name, adminPassword: dialog.adminPassword || "" }),
        });
        const updated = normalizeFolder(body.folder || { ...dialog.folder, name });
        setFolders((current) => current.map((folder) => folder.id === updated.id ? updated : folder));
        setActiveFolder((current) => current?.id === updated.id ? updated : current);
        notify("Folder name updated.");
      } else {
        const body = await requestJson("/next/api/products/kit-folders", {
          method: "POST",
          body: JSON.stringify({ name, parentFolderId: activeFolder?.id || "" }),
        });
        const created = normalizeFolder(body.folder || { name, parentFolderId: activeFolder?.id || "", canEdit: true });
        setFolders((current) => [created, ...current.filter((folder) => folder.id !== created.id)]);
        notify(`Folder “${created.name}” created.`);
      }
      setFolderDialog(null);
    } catch (error) {
      notify(error?.message || "The folder could not be saved.", "error");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const renameFolder = async (folder) => {
    let adminPassword = "";
    if (!folder?.canEdit) {
      adminPassword = await askPassword({ title: "Admin password required", message: `Enter the Admin password to rename “${folder.name}”.` });
      if (adminPassword === null) return;
    }
    setFolderDialog({ mode: "rename", folder, value: folder.name, adminPassword });
  };

  const deleteFolder = async (folder) => {
    let adminPassword = "";
    if (!folder?.canEdit) {
      adminPassword = await askPassword({ title: "Admin password required", message: `Enter the Admin password to delete “${folder.name}”.` });
      if (adminPassword === null) return;
    }
    const confirmed = await confirmDelete({
      itemName: folder.name,
      itemType: "folder",
      title: "Delete folder?",
      message: `Delete “${folder.name}”? Its kits and direct subfolders will return to the main Kits page; their contents will not be deleted.`,
      confirmLabel: "Delete Folder",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await requestJson(`/next/api/products/kit-folders/${encodeURIComponent(folder.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword }),
      });
      setFolders((current) => current.filter((entry) => entry.id !== folder.id)
        .map((entry) => entry.parentFolderId === folder.id ? { ...entry, parentFolderId: "" } : entry));
      setKits((current) => current.map((kit) => kit.folderId === folder.id ? { ...kit, folderId: "" } : kit));
      if (activeFolder?.id === folder.id) setActiveFolder(null);
      notify("Folder deleted. Its kits and direct subfolders were moved to the main Kits page.");
    } catch (error) {
      notify(error?.message || "The folder could not be deleted.", "error");
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

  const protectedPassword = async (kit, message) => {
    if (kit?.canEdit) return "";
    return await askPassword({ title: "Admin password required", message: message || "This kit belongs to another user." });
  };

  // ERP_KITS_CREATE_PERMISSIONS_MODERN_MENU_V1
  // Creation uses the existing Advanced Permissions gate (kits.create + kits.item_add).
  // Newly created kits belong to the signed-in user; no Admin password is needed.
  // Edit, move and delete of other users' kits keep their original verification.
  const startCreateKit = () => {
    if (!canCreate) return;
    const createdBy = text(account?.name || account?.fullName || account?.username || account?.email);
    setCreateMode(true);
    setDetailEdit(true);
    setEditAdminPassword("");
    setEditName("");
    setDraftErrors({ name: "", items: "" });
    setActiveDetail({
      kit: normalizeKit({ name: "", createdBy, canEdit: true, folderId: activeFolder?.id || "" }),
      items: [],
    });
    setSelectedProductId("");
    setProductSearch("");
    setProductQty(1);
  };

  const enterEditKit = async (kit) => {
    const adminPassword = await protectedPassword(kit, `Enter the Admin password to edit “${kit.name}”.`);
    if (adminPassword === null) return;
    setEditAdminPassword(adminPassword);
    await loadKit(kit.id, { edit: true, adminPassword });
  };

  const startMoveKit = async (kit) => {
    const adminPassword = await protectedPassword(kit, `Enter the Admin password to move “${kit.name}”.`);
    if (adminPassword === null) return;
    setMoveDialog({ kit, adminPassword });
  };

  const submitMoveKit = async (folderId) => {
    const dialog = moveDialog;
    if (dialog?.bulkIds?.length) {
      const finished = await runKitBulkAction("move", { folderId, ids: dialog.bulkIds });
      if (finished) setMoveDialog(null);
      return;
    }
    const kit = dialog?.kit;
    if (!kit?.id) return;
    const targetFolderId = text(folderId);
    if (targetFolderId === text(kit.folderId)) return;
    setBusy(true);
    try {
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ folderId: targetFolderId, adminPassword: dialog.adminPassword || "" }),
      });
      const updated = syncKit(body.kit || { ...kit, folderId: targetFolderId });
      setMoveDialog(null);
      const destination = targetFolderId ? folders.find((folder) => folder.id === targetFolderId)?.name || "the selected folder" : "Main Kits";
      notify(`“${updated.name}” moved to ${destination}.`);
    } catch (error) {
      notify(error?.message || "The kit could not be moved.", "error");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const submitNameDialog = async (name) => {
    const dialog = nameDialog;
    if (!dialog || dialog.mode !== "copy") return;
    setBusy(true);
    try {
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(dialog.kit.id)}/copy`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      syncKit(body.kit);
      setNameDialog(null);
      notify(`A copy named “${name}” was created.`);
    } catch (error) {
      notify(error?.message || "The kit copy could not be created.", "error");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const deleteKit = async (kit) => {
    const adminPassword = await protectedPassword(kit, `Enter the Admin password to delete “${kit.name}”.`);
    if (adminPassword === null) return;
    const confirmed = await confirmDelete({
      itemName: kit.name,
      itemType: "kit",
      title: "Delete kit?",
      message: `You’re going to permanently delete “${kit.name}” and all saved components. This action cannot be undone.`,
      confirmLabel: "Yes, Delete!",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword }),
      });
      setKits((current) => current.filter((item) => item.id !== kit.id));
      if (activeDetail?.kit?.id === kit.id) backToKits();
      notify("Kit deleted.");
    } catch (error) {
      notify(error?.message || "The kit could not be deleted.", "error");
    } finally {
      setBusy(false);
    }
  };

  const addSelectedProduct = async () => {
    const product = productMap.get(selectedProductId);
    if (!product) {
      setDraftErrors((current) => ({ ...current, items: "Select a product first." }));
      return;
    }
    const quantity = Math.max(1, Math.round(number(productQty) || 1));
    startActionLoading({ title: "Adding component", message: `Adding ${product.name} to the kit…` });

    if (createMode) {
      try {
        setActiveDetail((current) => {
          const items = Array.isArray(current?.items) ? [...current.items] : [];
          const existingIndex = items.findIndex((item) => text(item.productId) === product.id);
          if (existingIndex >= 0) {
            const existing = items[existingIndex];
            items[existingIndex] = { ...existing, quantity: Math.max(1, number(existing.quantity) + quantity), updatedAt: new Date().toISOString() };
          } else {
            items.push(normalizeItem({
              id: `draft-kit-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              productId: product.id,
              productName: product.name,
              quantity,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }, items.length));
          }
          return { ...(current || {}), items };
        });
        setDraftErrors((current) => ({ ...current, items: "" }));
        setSelectedProductId("");
        setProductSearch("");
        setProductQty(1);
        setProductPickerOpen(false);
        notify("Product added to kit draft.");
        await finishActionLoading("done", `${product.name} added successfully.`);
      } catch (error) {
        const message = error?.message || "The product could not be added.";
        await finishActionLoading("failed", message);
        notify(message, "error");
      }
      return;
    }

    const kit = activeDetail?.kit;
    if (!kit?.id) {
      await finishActionLoading("failed", "The kit could not be found.");
      return;
    }
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/items`, {
        method: "POST",
        body: JSON.stringify({ productId: product.id, quantity, adminPassword: editAdminPassword }),
      });
      setDetailFromBody(body);
      setEditName(pendingName);
      setDraftErrors((current) => ({ ...current, items: "" }));
      setSelectedProductId("");
      setProductSearch("");
      setProductQty(1);
      setProductPickerOpen(false);
      notify("Product added to kit.");
      await finishActionLoading("done", `${product.name} added successfully.`);
    } catch (error) {
      const message = error?.message || "The product could not be added.";
      await finishActionLoading("failed", message);
      notify(message, "error");
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
    const kit = activeDetail?.kit;
    if (!kit?.id) return;
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, adminPassword: editAdminPassword }),
      });
      setDetailFromBody(body);
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
      message: `Remove “${row.name}” from this kit? The product itself will stay in the Products catalogue.`,
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
    const kit = activeDetail?.kit;
    if (!kit?.id) return;
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword: editAdminPassword }),
      });
      setDetailFromBody(body);
      setEditName(pendingName);
      notify("Component removed.");
    } catch (error) {
      notify(error?.message || "The component could not be removed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const saveKit = async () => {
    const cleanName = text(editName);
    const rows = Array.isArray(activeDetail?.items) ? activeDetail.items : [];
    const errors = {
      name: cleanName ? "" : "Kit name is required.",
      items: rows.length ? "" : createMode ? "Add at least one component before saving the kit." : "Add at least one component before saving changes.",
    };
    setDraftErrors(errors);
    if (errors.name || errors.items) return;

    const validRows = rows.filter((row) => row.productId);
    setBusy(true);
    startSaveProgress({
      title: createMode ? "Saving kit" : "Saving changes",
      message: createMode ? `Preparing ${validRows.length} component${validRows.length === 1 ? "" : "s"}…` : "Updating your kit…",
    });
    try {
      if (createMode) {
        const createdBody = await requestJson("/next/api/products/kits", {
          method: "POST",
          body: JSON.stringify({ name: cleanName, adminPassword: editAdminPassword, folderId: activeDetail?.kit?.folderId || activeFolder?.id || "" }),
        });
        const created = normalizeKit({ ...(createdBody.kit || {}), canEdit: true });
        if (!created.id) throw new Error("Kit was created but the kit ID was not returned.");

        updateSaveProgress(18, "Kit created. Saving components…");
        for (let index = 0; index < validRows.length; index += 1) {
          const row = validRows[index];
          await requestJson(`/next/api/products/kits/${encodeURIComponent(created.id)}/items`, {
            method: "POST",
            body: JSON.stringify({ productId: row.productId, quantity: row.quantity, adminPassword: editAdminPassword }),
          });
          const componentProgress = 18 + Math.round(((index + 1) / Math.max(1, validRows.length)) * 68);
          updateSaveProgress(componentProgress, `Saving component ${index + 1} of ${validRows.length}…`);
        }
        await refreshKits();
        updateSaveProgress(94, "Refreshing kits…");
        notify("Kit saved successfully.");
        await finishSaveProgress("done", "Kit saved successfully.");
        backToKits();
        return;
      }

      const kit = activeDetail?.kit;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: cleanName, adminPassword: editAdminPassword }),
      });
      updateSaveProgress(86, "Applying the latest changes…");
      const updated = normalizeKit(body.kit || { ...kit, name: cleanName });
      setActiveDetail((current) => current ? { ...current, kit: updated } : current);
      setKits((current) => current.map((entry) => entry.id === updated.id ? { ...updated, itemsCount: rows.length } : entry));
      setEditName(updated.name);
      setDraftErrors({ name: "", items: "" });
      notify("Changes saved.");
      await finishSaveProgress("done", "Kit changes saved successfully.");
    } catch (error) {
      const message = error?.message || `Failed to ${createMode ? "create" : "update"} kit.`;
      await finishSaveProgress("failed", message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  };

  // ERP_KITS_MULTI_SELECT_ACTIONS_V1: original single-kit menu remains unchanged.
  const startKitSelection = (kit) => {
    setFolderMenu("");
    setKitSelectMode(true);
    setSelectedKitIds([kit.id]);
  };
  const toggleSelectedKit = (id) => {
    setFolderMenu("");
    setSelectedKitIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const exitKitSelection = () => {
    setFolderMenu("");
    setKitSelectMode(false);
    setSelectedKitIds([]);
  };

  const runKitBulkAction = async (action, options = {}) => {
    if (bulkRunningRef.current || busy) return false;
    const ids = options.ids || selectedKitIds;
    // This menu never acts on hidden items or folders; every action is per Kit.
    const targets = kits.filter((kit) => ids.includes(kit.id));
    if (!targets.length) return false;
    const allowed = action === "move" ? can("edit")
      : action === "copy" ? can("copy")
      : action === "delete" ? can("delete")
      : action === "edit" ? can("item_add") : false;
    if (!allowed) {
      notify("You don't have permission for this Kit action.", "error");
      return false;
    }
    if (action === "edit" && (!options.productId || !Number.isInteger(Number(options.quantity)) || Number(options.quantity) < 1)) {
      notify("Select a component and a valid quantity.", "error");
      return false;
    }
    if (action === "move" && !folders.some((folder) => folder.id === text(options.folderId)) && text(options.folderId)) {
      notify("The destination folder no longer exists.", "error");
      return false;
    }
    let adminPassword = "";
    // Existing per-owner Admin verification is retained by the API; request it
    // once for a batch if some selected Kits are owned by another user.
    if (action !== "copy" && targets.some((kit) => !kit.canEdit)) {
      adminPassword = await askPassword({
        title: "Admin password required",
        message: `Enter the Admin password to ${action} ${targets.length} selected kits owned by other users.`,
      });
      if (adminPassword === null) return false;
    }
    if (action === "delete") {
      const confirmed = await confirmDelete({
        itemName: `${targets.length} selected kits`, itemType: "kit",
        title: `Delete ${targets.length} kits?`,
        message: `Permanently delete the ${targets.length} selected kits and their components? This cannot be undone.`,
        confirmLabel: `Delete ${targets.length} Kits`,
      });
      if (!confirmed) return false;
    }
    bulkRunningRef.current = true;
    setBusy(true);
    setFolderMenu("");
    const failures = [];
    let succeeded = 0;
    try {
      for (const kit of targets) {
        try {
          if (action === "move") {
            // Skip Kits already in the selected folder (no destructive changes).
            if (kit.folderId !== text(options.folderId)) {
              const response = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}`, {
                method: "PATCH",
                body: JSON.stringify({ folderId: text(options.folderId), adminPassword }),
              });
              syncKit(response.kit || { ...kit, folderId: text(options.folderId) });
            }
          } else if (action === "copy") {
            const response = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/copy`, {
              method: "POST", body: JSON.stringify({ name: `${kit.name} copy` }),
            });
            if (response.kit) syncKit(response.kit);
          } else if (action === "delete") {
            await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}`, {
              method: "DELETE", body: JSON.stringify({ adminPassword }),
            });
            setKits((current) => current.filter((item) => item.id !== kit.id));
          } else if (action === "edit") {
            // Same add-component operation applied to each Kit. If the product
            // exists, the existing API ADDS the quantity; no other data is erased.
            await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/items`, {
              method: "POST",
              body: JSON.stringify({ productId: options.productId, quantity: Number(options.quantity), adminPassword }),
            });
          }
          succeeded += 1;
        } catch (error) {
          failures.push({ id: kit.id, name: kit.name, message: error?.message || "Request failed" });
        }
      }
      await refreshKits();
      if (failures.length) {
        // Keep failed Kits selected for retry; don't repeat successful operations.
        setSelectedKitIds(failures.map((item) => item.id));
        notify(`${succeeded} completed; ${failures.length} failed. ${failures.slice(0, 2).map((item) => `${item.name}: ${item.message}`).join(" | ")}`, "error");
      } else {
        setSelectedKitIds([]);
        setKitSelectMode(false);
        notify(`${action === "edit" ? "Component updated in" : action === "copy" ? "Copied" : action === "move" ? "Moved" : "Deleted"} ${succeeded} kit${succeeded === 1 ? "" : "s"}.`);
      }
      return true;
    } finally {
      setBusy(false);
      bulkRunningRef.current = false;
    }
  };

  const startBulkMove = () => {
    const selected = kits.filter((kit) => selectedKitIds.includes(kit.id));
    if (!selected.length) return;
    // All Kits currently shown are in the same folder. Use its existing Move
    // picker to select any nested destination for the entire batch.
    setFolderMenu("");
    setMoveDialog({
      kit: { ...selected[0], name: `${selected.length} selected kits` },
      bulkIds: selected.map((kit) => kit.id),
    });
  };

  const startBulkEdit = () => {
    if (!selectedKitIds.length) return;
    setFolderMenu("");
    setBulkEditOpen(true);
  };

  const renderKitCard = (kit) => {
    const menuKey = `kit:${kit.id}`;
    const menuOpen = folderMenu === menuKey;
    const selected = selectedKitIds.includes(kit.id);
    return (
      <article className={`products-proposal-folder kit-library-kit ${menuOpen ? "is-menu-open" : ""} ${kitSelectMode ? "kit-bulk-selectable" : ""} ${selected ? "kit-bulk-selected" : ""}`} key={kit.id}>
        {kitSelectMode ? <span className="kit-bulk-selection-indicator" aria-hidden="true">{selected ? "✓" : ""}</span> : null}
        {menuOpen && (kitSelectMode || can("edit") || can("copy") || can("delete") || can("item_add") || can("item_edit") || can("item_delete")) ? (
          <KitModernActionMenu title={kitSelectMode ? `${selectedKitIds.length} kits selected` : "Kit actions"}>
            {!kitSelectMode && (can("edit") || can("copy") || can("delete") || can("item_add")) ? (
              <button type="button" onClick={() => startKitSelection(kit)}><FeatherIcon name="grid" /><span>Select</span></button>
            ) : null}
            {!kitSelectMode && (can("edit") || can("item_add") || can("item_edit") || can("item_delete")) ? <button type="button" onClick={() => { setFolderMenu(""); enterEditKit(kit); }}><FeatherIcon name="edit" /><span>Edit</span></button> : null}
            {!kitSelectMode && can("edit") ? <button type="button" onClick={() => { setFolderMenu(""); startMoveKit(kit); }}><FeatherIcon name="move" /><span>Move</span></button> : null}
            {!kitSelectMode && can("copy") ? <button type="button" onClick={() => { setFolderMenu(""); setNameDialog({ mode: "copy", kit, value: `${kit.name} copy` }); }}><FeatherIcon name="copy" /><span>Make a copy</span></button> : null}
            {!kitSelectMode && can("delete") ? <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); deleteKit(kit); }}><FeatherIcon name="trash" /><span>Delete</span></button> : null}
            {kitSelectMode && can("item_add") && selectedKitIds.length > 0 ? <button type="button" onClick={startBulkEdit}><FeatherIcon name="edit" /><span>Edit · Add component</span></button> : null}
            {kitSelectMode && can("edit") && selectedKitIds.length > 0 ? <button type="button" onClick={startBulkMove}><FeatherIcon name="move" /><span>Move selected</span></button> : null}
            {kitSelectMode && can("copy") && selectedKitIds.length > 0 ? <button type="button" onClick={() => runKitBulkAction("copy")}><FeatherIcon name="copy" /><span>Make copies</span></button> : null}
            {kitSelectMode && can("delete") && selectedKitIds.length > 0 ? <button type="button" className="is-danger" onClick={() => runKitBulkAction("delete")}><FeatherIcon name="trash" /><span>Delete selected</span></button> : null}
            {kitSelectMode ? <button type="button" onClick={exitKitSelection}><FeatherIcon name="arrowLeft" /><span>Exit selection</span></button> : null}
          </KitModernActionMenu>
        ) : null}
        <button
          type="button"
          className="products-proposal-folder__main products-proposal-folder__main--long-press"
          onPointerDown={(event) => startFolderLongPress(event, menuKey)}
          onPointerMove={moveFolderLongPress}
          onPointerUp={cancelFolderLongPress}
          onPointerCancel={cancelFolderLongPress}
          onPointerLeave={cancelFolderLongPress}
          onContextMenu={(event) => {
            event.preventDefault();
            cancelFolderLongPress();
            suppressFolderClickRef.current = true;
            if (kitSelectMode) setSelectedKitIds((current) => current.includes(kit.id) ? current : [...current, kit.id]);
            setFolderMenu(menuKey);
          }}
          onKeyDown={(event) => openFolderActionsFromKeyboard(event, menuKey)}
          onClick={() => {
            if (suppressFolderClickRef.current) {
              suppressFolderClickRef.current = false;
              return;
            }
            if (kitSelectMode) { toggleSelectedKit(kit.id); return; }
            loadKit(kit.id, { edit: false, adminPassword: "" });
          }}
          aria-label={kitSelectMode ? `${selected ? "Deselect" : "Select"} ${kit.name}. Long-press for bulk actions.` : `Open ${kit.name}. Press and hold for actions.`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="proposal-folder-figure" aria-hidden="true">
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
            <span className="proposal-folder-figure__back" />
            <span className="proposal-folder-figure__front"><small>K</small></span>
          </span>
          <span className="proposal-folder-copy"><strong>{kit.name}</strong><em>Created by {kit.createdBy || "—"}</em></span>
          <span className="proposal-folder-count"><FeatherIcon name="copy" /><span>{formatNumber(kit.itemsCount)} component{kit.itemsCount === 1 ? "" : "s"}</span></span>
        </button>
      </article>
    );
  };

  const renderDetailComponentCard = (row) => {
    const files = row.product?.attachments || [];
    const multiFile = files.length > 1 && Boolean(row.product?.id);
    const resourceUrl = multiFile
      ? `/next/api/products/files-download?id=${encodeURIComponent(row.product.id)}`
      : files[0]?.url || row.product?.url;
    return (
      <article className={`kit-component-card ${detailEdit ? "is-editable" : "is-view"}`} key={row.id}>
        <header className="kit-component-card__head">
          <div className="kit-component-card__title">
            <span>Component</span>
            <h4>{row.name}</h4>
          </div>
        </header>
  
        <div className="kit-component-card__metrics">
          <div className="kit-component-card__metric kit-component-card__metric--qty">
            <span>Qty</span>
            {detailEdit && (createMode || can("item_edit")) ? (
              <input
                className="proposal-item-qty kit-component-card__qty-input"
                type="number"
                min="1"
                step="1"
                defaultValue={row.quantity}
                key={`${row.id}-${row.quantity}`}
                onChange={(event) => createMode ? updateQuantity(row, event.target.value) : undefined}
                onBlur={(event) => !createMode ? updateQuantity(row, event.target.value) : undefined}
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
  
        <footer className="kit-component-card__actions">
          {resourceUrl ? (
            <a className="kit-component-card__action kit-component-card__action--link" href={resourceUrl}
              target={multiFile ? undefined : "_blank"} rel={multiFile ? undefined : "noreferrer"}
              aria-label={multiFile ? `Download all ${files.length} files for ${row.name} as ZIP` : `Open product link for ${row.name}`}
              title={multiFile ? `Download ${files.length} files as ZIP` : "Open link"}>
              <FeatherIcon name={multiFile ? "download" : "externalLink"} /><span>{multiFile ? `Download ZIP (${files.length} files)` : "Open link"}</span>
            </a>
          ) : (
            <span className="kit-component-card__action kit-component-card__action--disabled" aria-label="No product link">
              <FeatherIcon name="minus" /><span>No link</span>
            </span>
          )}
          {detailEdit && (createMode || can("item_delete")) ? (
            <button type="button" className="kit-component-card__action kit-component-card__action--remove" onClick={() => removeItem(row)} aria-label={`Delete ${row.name}`} title="Delete">
              <FeatherIcon name="trash" /><span>Remove</span>
            </button>
          ) : null}
        </footer>
      </article>
    );
  };

  const renderLibraryFolder = (folder) => {
    const menuKey = `folder:${folder.id}`;
    const menuOpen = folderMenu === menuKey;
    const kitCount = folderKitCounts.get(folder.id) || 0;
    const childCount = nestedFolderCounts.get(folder.id) || 0;
    return (
      <article className={`products-proposal-folder kit-library-folder ${menuOpen ? "is-menu-open" : ""}`} key={folder.id}>
        {menuOpen && can("folder_manage") ? (
          <KitModernActionMenu title="Folder actions">
            {can("folder_manage") ? <button type="button" onClick={() => { setFolderMenu(""); renameFolder(folder); }}><FeatherIcon name="edit" /><span>Rename</span></button> : null}
            {can("folder_manage") ? <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); deleteFolder(folder); }}><FeatherIcon name="trash" /><span>Delete folder</span></button> : null}
          </KitModernActionMenu>
        ) : null}
        <button
          type="button"
          className="products-proposal-folder__main products-proposal-folder__main--long-press"
          onPointerDown={(event) => startFolderLongPress(event, menuKey)}
          onPointerMove={moveFolderLongPress}
          onPointerUp={cancelFolderLongPress}
          onPointerCancel={cancelFolderLongPress}
          onPointerLeave={cancelFolderLongPress}
          onContextMenu={(event) => {
            event.preventDefault();
            cancelFolderLongPress();
            suppressFolderClickRef.current = true;
            setFolderMenu(menuKey);
          }}
          onKeyDown={(event) => openFolderActionsFromKeyboard(event, menuKey)}
          onClick={() => {
            if (suppressFolderClickRef.current) {
              suppressFolderClickRef.current = false;
              return;
            }
            openFolder(folder);
          }}
          aria-label={`Open folder ${folder.name}. Press and hold for actions.`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="proposal-folder-figure" aria-hidden="true">
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
            <span className="proposal-folder-figure__back" />
            <span className="proposal-folder-figure__front"><small>F</small></span>
          </span>
          <span className="proposal-folder-copy"><strong>{folder.name}</strong><em>Kit folder</em></span>
          <span className="proposal-folder-count"><FeatherIcon name="folder" /><span>{formatNumber(kitCount)} kit{kitCount === 1 ? "" : "s"}{childCount ? ` · ${childCount} folder${childCount === 1 ? "" : "s"}` : ""}</span></span>
        </button>
      </article>
    );
  };

  if (activeDetail || detailBusy) {
    const kit = activeDetail?.kit;
    const breadcrumbFolder = activeFolder || folders.find((folder) => folder.id === kit?.folderId) || null;
    const breadcrumbPath = kitFolderPath(breadcrumbFolder, folders);
    return (
      <main className="products-shell proposals-shell next-proposals-classic-parity next-kits-classic-parity">
        {activeDetail ? <HeaderFolderBreadcrumb segments={[
          {label:"Kits",icon:"briefcase",onClick:() => { backToKits(); backToFolderRoot(); }},
          ...breadcrumbPath.map((folder) => ({label:folder.name,icon:"folder-check",onClick:() => { setActiveFolder(folder); backToKits(); }})),
          {label:createMode ? "Create New Kit" : activeDetail.kit?.name || "Kit",icon:"briefcase"}
        ]}/> : null}
        <Toast toast={toast} onClose={() => setToast(null)} />
        <SaveProgressModal state={saveProgress} />
        <ActionLoadingModal state={actionLoading} />
        <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
          <section className="proposals-panel">
            <section className={`products-proposal-detail ${createMode ? "is-create" : detailEdit ? "is-edit" : "is-view"}`}>
              {detailBusy && !activeDetail ? (
                <div className="products-loading-card" role="status" aria-live="polite">
                  <div className="products-spinner" aria-hidden="true" />
                  <div><strong>Loading kit</strong></div>
                </div>
              ) : (
                <>
                  {createMode ? (
                    <header className="products-proposal-detail__head kit-create-label-head">
                      <div className="kit-create-title-pill">
                        <button type="button" className="products-back-btn" onClick={backToKits} aria-label="Back to kits"><FeatherIcon name="arrowLeft" /></button>
                        <span>Create New Kit</span>
                      </div>
                    </header>
                  ) : (
                    <header className="products-proposal-detail__head proposal-detail-head--compact">
                      <div className="proposal-detail-actions proposal-detail-actions--classic">
                        <div className="proposal-download-menu-wrap">
                          <button type="button" className="btn b2b-download-primary proposal-download-btn" onClick={() => { setDownloadMenuOpen(true); setSortMenuOpen(false); }}>
                            <FeatherIcon name="download" /><span>Download</span><FeatherIcon name="chevronDown" size={15} />
                          </button>
                        </div>
                        <div className="proposal-sort-menu-wrap">
                          <button type="button" className="products-btn proposal-sort-btn" onClick={() => { setSortMenuOpen((open) => !open); setDownloadMenuOpen(false); }}>
                            <FeatherIcon name="sort" /><span>Sort</span><FeatherIcon name="chevronDown" size={15} />
                          </button>
                          {sortMenuOpen ? (
                            <div className="proposal-sort-menu" role="menu">
                              <button type="button" className={groupBy === "component-tag" ? "is-active" : ""} onClick={() => chooseGroupBy("component-tag")}>
                                <span className="proposal-sort-menu__check">{groupBy === "component-tag" ? "✓" : ""}</span>
                                <span><strong>By components tag</strong><small>Group by the product component tag.</small></span>
                              </button>
                              <button type="button" className={groupBy === "kit-tag" ? "is-active" : ""} onClick={() => chooseGroupBy("kit-tag")}>
                                <span className="proposal-sort-menu__check">{groupBy === "kit-tag" ? "✓" : ""}</span>
                                <span><strong>By kits tag</strong><small>Folder → kit → components.</small></span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {can("send_stock") ? <button type="button" className="products-btn products-btn--dark proposal-send-stock-btn" onClick={openSendToStock} disabled={!enrichedRows.length}>
                          <FeatherIcon name="archive" /><span>Send to stock</span>
                        </button> : null}
                      </div>
                    </header>
                  )}

                  {!createMode && !detailEdit ? (
                    <div className="proposal-classic-detail-title">
                      <span className="proposal-create-title-pill"><span>{kit?.name || "Kit"}</span></span>
                      <p>{formatNumber(enrichedRows.length)} saved component{enrichedRows.length === 1 ? "" : "s"} • View only</p>
                    </div>
                  ) : null}

                  {detailEdit ? (
                    <>
                      <div className={`proposal-name-edit-block proposal-name-edit-block--footer-save ${createMode ? "proposal-name-edit-block--create proposal-name-edit-block--kit-create" : "proposal-name-edit-block--kit-edit"}`}>
                        <label className="products-field products-field--wide">
                          <span>Kit name <em>*</em></span>
                          <input
                            type="text"
                            value={editName}
                            disabled={!createMode && !can("edit")}
                            onChange={(event) => {
                              setEditName(event.target.value);
                              if (text(event.target.value)) setDraftErrors((current) => ({ ...current, name: "" }));
                            }}
                            autoComplete="off"
                            placeholder="Example: Arduino starter kit"
                          />
                        </label>
                        <div className="direct-create-inline-error direct-create-inline-error--name kit-create-inline-error kit-create-inline-error--name" aria-live="polite">{draftErrors.name}</div>
                      </div>

                      {(createMode || can("item_add")) ? <div className="products-proposal-tools proposals-one-tool">
                        <div className={`products-proposal-tool-card ${productPickerOpen ? "has-open-select" : ""}`}>
                          <div className="products-proposal-tool-title"><FeatherIcon name="plusCircle" /><span>Add kit component</span></div>
                          <div className="products-proposal-control-grid">
                            <label className="products-field proposals-search-field">
                              <span>Component</span>
                              <div className={`proposal-search-select ${productPickerOpen ? "is-open" : ""}`} ref={pickerRef}>
                                <button
                                  type="button"
                                  className="proposal-search-select__button"
                                  onClick={() => setProductPickerOpen((open) => !open)}
                                  aria-haspopup="listbox"
                                  aria-expanded={productPickerOpen}
                                >
                                  <span className="proposal-search-select__value">{selectedProduct ? `${selectedProduct.name}${selectedProduct.displayId ? ` · ${selectedProduct.displayId}` : ""}` : "Search or select component"}</span>
                                  <FeatherIcon name="chevronDown" />
                                </button>
                                {productPickerOpen ? (
                                  <div className="proposal-search-select__menu" role="listbox">
                                    <div className="proposal-search-select__search">
                                      <FeatherIcon name="search" />
                                      <input autoFocus type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search..." autoComplete="off" />
                                    </div>
                                    <div className="proposal-search-select__options">
                                      {filteredProducts.map((product) => (
                                        <button
                                          type="button"
                                          className="proposal-search-select__option"
                                          key={product.id}
                                          onClick={() => {
                                            setSelectedProductId(product.id);
                                            setProductPickerOpen(false);
                                            setDraftErrors((current) => ({ ...current, items: "" }));
                                          }}
                                        >
                                          <span>{product.name}{product.displayId ? ` · ${product.displayId}` : ""}</span>
                                          <small>{[firstTag(product), product.unit].filter(Boolean).join(" · ") || "Catalogue product"}</small>
                                        </button>
                                      ))}
                                      {!filteredProducts.length ? <div className="proposal-search-select__empty">No products available</div> : null}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </label>
                            <label className="products-field products-field--qty">
                              <span>Qty</span>
                              <input type="number" min="1" step="1" value={productQty} onChange={(event) => setProductQty(event.target.value)} inputMode="numeric" />
                            </label>
                            <button type="button" className="products-btn products-btn--dark" onClick={addSelectedProduct} disabled={busy}><FeatherIcon name="plus" /><span>Add</span></button>
                          </div>
                        </div>
                      </div> : null}
                      <div className="direct-create-inline-error direct-create-inline-error--items kit-create-inline-error kit-create-inline-error--items" aria-live="polite">{draftErrors.items}</div>
                    </>
                  ) : (
                    <div className="proposal-view-note"><FeatherIcon name="eye" /><span>View only. Use the 3-dot menu then Edit to modify this kit.</span></div>
                  )}

                  <div className="products-proposal-table-card">
                    <div className="products-proposal-table-head">
                      <div><h3>Kit components</h3><p>These quantities will be copied into any proposal when you add this kit.</p></div>
                      <span>{formatNumber(enrichedRows.length)} item{enrichedRows.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="products-proposal-table-wrap kit-components-wrap">
                      <div className="proposal-components-groups kit-components-groups">
                        {groupBy === "kit-tag" ? (
                          kitGroupedVisibleRows.map((folder) => (
                            <section className="proposal-kit-folder-group" key={`${folder.id || "unfiled"}-${folder.label}`}>
                              <div className="proposal-kit-folder-group__head">
                                <div><span>Kit folder</span><strong>{folder.label}</strong></div>
                                <em>{folder.kits.length} kit{folder.kits.length === 1 ? "" : "s"}</em>
                              </div>
                              <div className="proposal-kit-folder-group__body">
                                {folder.kits.map((groupedKit) => (
                                  <div className="proposal-kit-group" key={`${groupedKit.id || "kit"}-${groupedKit.label}`}>
                                    <div className="proposal-kit-group__head">
                                      <div><span>Kit</span><strong>{groupedKit.label}</strong></div>
                                      <em>{groupedKit.rows.length} item{groupedKit.rows.length === 1 ? "" : "s"}</em>
                                    </div>
                                    <div className="kit-components-grid">
                                      {groupedKit.rows.map(renderDetailComponentCard)}
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
                              <div className="kit-components-grid">
                                {group.rows.map(renderDetailComponentCard)}
                              </div>
                            </section>
                          ))
                        )}
                        {!visibleEnrichedRows.length ? <div className="products-table-empty kit-components-empty">{enrichedRows.length ? "No components match your search." : <>No components yet. {detailEdit ? "Add one component above." : "Open Edit from the folder menu to add components."}</>}</div> : null}
                      </div>
                    </div>
                    <div className="proposal-total-block">
                      <div><span>Total requested items</span><strong>{formatNumber(detailTotals.items)} item{detailTotals.items === 1 ? "" : "s"}</strong></div>
                      <div><span>Total quantity</span><strong>{formatNumber(detailTotals.quantity)}</strong></div>
                      <div><span>Total cost</span><strong>{formatMoney(detailTotals.value)}</strong></div>
                    </div>
                  </div>

                  {detailEdit ? (
                    <div className={`kit-create-save-footer direct-create-save-footer ${createMode ? "direct-create-save-footer--create" : "direct-create-save-footer--edit"}`}>
                      <button type="button" className="products-btn products-btn--light direct-create-cancel-btn" onClick={backToKits} disabled={busy}>Cancel</button>
                      {(createMode || can("edit")) ? <button type="button" className="products-btn products-btn--dark kit-create-save-btn direct-create-save-btn" onClick={saveKit} disabled={busy}>
                        <FeatherIcon name="save" /><span>{busy ? "Saving…" : createMode ? "Save" : "Save Changes"}</span>
                      </button> : null}
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </section>
        </section>

        {downloadMenuOpen && kit ? (
          <KitDownloadModal
            columns={exportColumns}
            onToggleColumn={toggleExportColumn}
            onDownload={downloadKit}
            onClose={() => setDownloadMenuOpen(false)}
          />
        ) : null}
        {sendToStockOpen && kit ? (
          <SendKitToStockModal
            kit={kit}
            members={members}
            busy={busy}
            onClose={() => setSendToStockOpen(false)}
            onSubmit={sendKitToStock}
          />
        ) : null}
        {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.kit?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
        {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
      </main>
    );
  }

  return (
    <main className="products-shell proposals-shell next-proposals-classic-parity next-kits-classic-parity">
      {activeFolder ? <HeaderFolderBreadcrumb segments={[
        {label:"Kits",icon:"briefcase",onClick:backToFolderRoot},
        ...kitFolderPath(activeFolder, folders).map((folder) => ({label:folder.name,icon:"folder-check",onClick:() => openFolder(folder)}))
      ]}/> : null}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {bootstrapWarnings.length ? <div className="proposal-view-note"><span aria-hidden="true">!</span><span>Some startup resources were delayed. The page remains usable; refresh if a kit or folder is missing.</span></div> : null}

      <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
        <section className="proposals-panel">
          {kitSelectMode ? (
            <div className="kit-bulk-toolbar" role="group" aria-label="Multi-select Kits">
              <div className="kit-bulk-toolbar__label"><FeatherIcon name="grid" /><span>{selectedKitIds.length} selected</span></div>
              <div className="kit-bulk-toolbar__controls">
                <button type="button" onClick={() => setSelectedKitIds(filteredKits.map((kit) => kit.id))} disabled={busy}>Select all</button>
                <button type="button" className="kit-bulk-toolbar__actions" onClick={() => { if (selectedKitIds.length) setFolderMenu(`kit:${selectedKitIds[0]}`); }} disabled={busy || !selectedKitIds.length}>Actions</button>
                <button type="button" onClick={exitKitSelection} disabled={busy}>Done</button>
              </div>
              <small>Tap Kits to select · Long-press a selected Kit for actions</small>
            </div>
          ) : null}
          <div className="products-proposals-list">
            {(filteredFolders.length || filteredKits.length || canCreate || can("folder_create")) ? (
              <div className="products-proposal-folders kit-library-grid kit-library-grid--root">
                {can("folder_create") ? (
                  <div className="kit-quick-create kit-quick-create--folder">
                    <button
                      type="button"
                      className="kit-quick-create__tile"
                      onClick={() => { setFolderMenu(""); setFolderDialog({ mode: "create", value: "" }); }}
                      aria-label="Create Folder"
                    >
                      <span className="kit-quick-create__illustration" aria-hidden="true">
                        <FeatherIcon name="folderPlus" />
                      </span>
                      <strong>Create Folder</strong>
                      <small>Add a new folder</small>
                    </button>
                  </div>
                ) : null}
                {canCreate ? (
                  <div className="kit-quick-create kit-quick-create--kit">
                    <button
                      type="button"
                      className="kit-quick-create__tile"
                      onClick={() => { setFolderMenu(""); startCreateKit(); }}
                      aria-label="Create Kit"
                    >
                      <span className="kit-quick-create__illustration" aria-hidden="true">
                        <FeatherIcon name="briefcase" />
                      </span>
                      <strong>Create Kit</strong>
                      <small>Add a new kit</small>
                    </button>
                  </div>
                ) : null}
                {filteredFolders.map(renderLibraryFolder)}
                {filteredKits.map(renderKitCard)}
              </div>
            ) : (
              <div className="products-proposals-empty">No folders or kits match your search.</div>
            )}
          </div>
        </section>
      </section>

      {folderDialog ? <FolderNameModal key={`${folderDialog.mode}-${folderDialog.folder?.id || "new"}`} dialog={folderDialog} busy={busy} onClose={() => setFolderDialog(null)} onSubmit={submitFolderDialog} /> : null}
      {bulkEditOpen ? <BulkKitEditModal count={selectedKitIds.length} products={products} busy={busy} onClose={() => setBulkEditOpen(false)} onSubmit={async (productId, quantity) => { const finished = await runKitBulkAction("edit", { productId, quantity }); if (finished) setBulkEditOpen(false); }} /> : null}
      {moveDialog ? <MoveKitModal key={`move-${moveDialog.kit?.id || "kit"}`} dialog={moveDialog} folders={folders.map((folder) => ({ ...folder, kitCount: folderKitCounts.get(folder.id) || 0 }))} busy={busy} onClose={() => setMoveDialog(null)} onSubmit={submitMoveKit} /> : null}
      {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.kit?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
      {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
    </main>
  );
}
