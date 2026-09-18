import "server-only";

import { getDirectSessionAccountGate } from "./direct-session-account";
import { select, selectAll, selectById } from "./supabase-rest";

const EVENT_LIST_CACHE_TTL_MS = 1_500;
const REFERENCE_CACHE_TTL_MS = 15_000;
const RATES_CACHE_TTL_MS = 5_000;

const listCache = new Map();
const inflight = new Map();

const STANDARD_TYPES = Object.freeze([
  { code: "tech_day", label: "Tech Day", isCustom: false },
  { code: "seminar", label: "Seminar", isCustom: false },
  { code: "steam_fair", label: "STEAM Fair", isCustom: false },
  { code: "competition", label: "Competition", isCustom: false },
  { code: "exhibition", label: "Exhibition", isCustom: false },
]);

const STANDARD_COMPONENT_CATEGORIES = Object.freeze([
  { code: "project", label: "Project Resource", isCustom: false },
  { code: "marketing_material", label: "Marketing Material", isCustom: false },
  { code: "venue_equipment", label: "Venue Equipment", isCustom: false },
]);

const EVENT_TYPES = new Set([...STANDARD_TYPES.map((item) => item.code), "other"]);
const EVENT_STATUSES = new Set(["submitted", "in_progress", "completed", "cancelled"]);
const COMPONENT_CATEGORIES = new Set([...STANDARD_COMPONENT_CATEGORIES.map((item) => item.code), "other"]);
const OWNERSHIP_TYPES = new Set(["company_owned", "external_rental"]);

function text(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function longText(value, maxLength = 5000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function bool(value) {
  return value === true || value === 1 || String(value || "").trim().toLowerCase() === "true";
}

function number(value, { min = 0, max = 1000000, fallback = 0, integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const safe = Math.max(min, Math.min(max, parsed));
  return integer ? Math.round(safe) : safe;
}

function money(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.max(0, Math.min(100000000, parsed)) * 100) / 100;
}

function array(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function uuid(value) {
  const id = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

function httpUrl(value, maxLength = 1000) {
  const raw = text(value, maxLength);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return /^https?:$/i.test(parsed.protocol) ? parsed.href.slice(0, maxLength) : "";
  } catch {
    return "";
  }
}

function typeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
}

function normalizeType(value) {
  const raw = typeCode(value);
  if (EVENT_TYPES.has(raw)) return raw;
  return /^custom_[a-z0-9_]{1,64}$/.test(raw) ? raw : "other";
}

function normalizeStatus(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === "under_review" || raw === "approved") return "submitted";
  return EVENT_STATUSES.has(raw) ? raw : "submitted";
}

function normalizeCategory(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (COMPONENT_CATEGORIES.has(raw)) return raw;
  return /^custom_[a-z0-9_]{1,64}$/.test(raw) ? raw : "other";
}

function normalizeOwnership(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return OWNERSHIP_TYPES.has(raw) ? raw : "company_owned";
}

function componentUnitCost(ownershipType, operatingCost, rentalCost) {
  const operating = money(operatingCost, 0);
  const rental = normalizeOwnership(ownershipType) === "external_rental" ? money(rentalCost, 0) : 0;
  return Math.round((operating + rental) * 100) / 100;
}

function normalizeProjects(value) {
  return array(value)
    .slice(0, 50)
    .map((row) => ({
      title: text(row?.title || row?.name, 180),
      description: longText(row?.description, 1500),
      quantity: number(row?.quantity, { min: 0, max: 100000, fallback: 1, integer: true }),
      workingCost: money(row?.workingCost ?? row?.working_cost ?? row?.cost, 0),
      notes: longText(row?.notes, 1500),
    }))
    .filter((row) => row.title);
}

function normalizeComponentRows(value) {
  return array(value)
    .slice(0, 100)
    .map((row) => {
      const quantity = number(row?.quantity, { min: 0, max: 100000, fallback: 1 });
      const ownershipType = normalizeOwnership(row?.ownershipType || row?.ownership_type);
      const operatingCost = money(row?.operatingCost ?? row?.operating_cost, 0);
      const rentalCost = ownershipType === "external_rental" ? money(row?.rentalCost ?? row?.rental_cost, 0) : 0;
      const unitCost = componentUnitCost(ownershipType, operatingCost, rentalCost);
      return {
        componentId: uuid(row?.componentId || row?.component_id || row?.id) || null,
        name: text(row?.name || row?.componentName || row?.component_name, 180),
        quantity,
        notes: longText(row?.notes, 1000),
        ownershipType,
        operatingCost,
        rentalCost,
        unitCost,
        totalCost: Math.round(unitCost * quantity * 100) / 100,
        linkUrl: httpUrl(row?.linkUrl || row?.link_url, 1000),
        photoUrl: httpUrl(row?.photoUrl || row?.photo_url, 2000),
      };
    })
    .filter((row) => row.name);
}

function eventsTable() {
  return text(process.env.SUPABASE_EVENTS_TABLE) || "events";
}

function componentsTable() {
  return text(process.env.SUPABASE_EVENT_COMPONENTS_TABLE) || "event_components";
}

function typesTable() {
  return text(process.env.SUPABASE_EVENT_TYPES_TABLE) || "event_type_catalog";
}

function categoriesTable() {
  return text(process.env.SUPABASE_EVENT_COMPONENT_CATEGORIES_TABLE) || "event_component_category_catalog";
}

function ratesTable() {
  return text(process.env.SUPABASE_EVENTS_GOVERNORATE_RATES_TABLE) || "event_governorate_transport_rates";
}

function serializeEvent(row = {}) {
  return {
    id: String(row?.id || ""),
    eventCode: text(row?.event_code, 80),
    eventName: text(row?.event_name, 240),
    eventType: normalizeType(row?.event_type),
    eventTypeCustom: text(row?.event_type_custom, 80) || null,
    status: normalizeStatus(row?.status),
    isArchived: bool(row?.is_archived ?? row?.isArchived),
    archivedAt: row?.archived_at || row?.archivedAt || null,
    organizationName: text(row?.organization_name, 240),
    contactPerson: text(row?.contact_person, 160),
    contactPhone: text(row?.contact_phone, 80),
    contactEmail: text(row?.contact_email, 200),
    eventStartDate: row?.event_start_date || null,
    eventEndDate: row?.event_end_date || null,
    expectedAttendees: number(row?.expected_attendees, { min: 0, max: 1000000, fallback: 0, integer: true }),
    audience: longText(row?.audience, 1000),
    projects: normalizeProjects(row?.projects),
    marketingMaterials: normalizeComponentRows(row?.marketing_materials),
    venueRequirements: normalizeComponentRows(row?.venue_requirements),
    venueName: text(row?.venue_name, 240),
    venueType: text(row?.venue_type, 120),
    governorate: text(row?.governorate, 120),
    locationUrl: httpUrl(row?.location_url, 1000),
    venueSetupTime: row?.venue_setup_time || null,
    requiresPower: bool(row?.requires_power),
    requiresInternet: bool(row?.requires_internet),
    requiresSoundSystem: bool(row?.requires_sound_system),
    venueNotes: longText(row?.venue_notes, 3000),
    transportRate: money(row?.transport_rate, 0),
    transportCalculation: text(row?.transport_calculation, 80) || "governorate_x2",
    workingCost: money(row?.working_cost, 0),
    transportCost: money(row?.transport_cost, 0),
    totalCost: money(row?.total_cost, 0),
    operationsNotes: longText(row?.operations_notes, 3000),
    requesterName: text(row?.requester_name, 160),
    createdByUserId: text(row?.created_by_user_id, 180) || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}

function serializeComponent(row = {}) {
  const ownershipType = normalizeOwnership(row?.ownership_type || row?.ownershipType);
  const operatingCost = money(row?.operating_cost ?? row?.operatingCost, 0);
  const rentalCost = ownershipType === "external_rental" ? money(row?.rental_cost ?? row?.rentalCost, 0) : 0;
  return {
    id: String(row?.id || ""),
    name: text(row?.name, 180),
    category: normalizeCategory(row?.category),
    description: longText(row?.description, 2000),
    defaultQuantity: number(row?.default_quantity, { min: 0, max: 100000, fallback: 1 }),
    ownershipType,
    operatingCost,
    rentalCost,
    unitCost: componentUnitCost(ownershipType, operatingCost, rentalCost),
    photoUrl: httpUrl(row?.photo_url || row?.photoUrl, 2000),
    linkUrl: httpUrl(row?.link_url || row?.linkUrl, 1000),
    isActive: row?.is_active !== false,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}

function serializeType(row = {}) {
  const code = normalizeType(row?.code);
  const label = text(row?.label, 80);
  return {
    code: /^custom_/.test(code) ? code : "",
    label,
    isCustom: true,
    isActive: row?.is_active !== false,
    createdAt: row?.created_at || null,
  };
}

function serializeCategory(row = {}) {
  const code = normalizeCategory(row?.code);
  const label = text(row?.label, 80);
  return {
    code: /^custom_/.test(code) ? code : "",
    label,
    isCustom: true,
    isActive: row?.is_active !== false,
    createdAt: row?.created_at || null,
  };
}

function serializeRate(row = {}) {
  return {
    id: String(row?.id || ""),
    areaName: text(row?.area_name || row?.areaName, 120),
    transportCost: money(row?.transport_cost ?? row?.transportCost, 0),
    isActive: row?.is_active !== false,
    sortOrder: number(row?.sort_order ?? row?.sortOrder, { min: 0, max: 100000, fallback: 100, integer: true }),
    updatedAt: row?.updated_at || row?.updatedAt || null,
  };
}

async function cached(key, ttlMs, loader, { force = false } = {}) {
  const now = Date.now();
  const current = listCache.get(key);
  if (!force && current?.expiresAt > now) return current.value;
  if (!force && inflight.has(key)) return await inflight.get(key);

  const pending = Promise.resolve().then(loader);
  if (!force) inflight.set(key, pending);
  try {
    const value = await pending;
    listCache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  } finally {
    if (!force && inflight.get(key) === pending) inflight.delete(key);
  }
}

export async function listEvents({ includeArchived = false, status = "all", search = "", force = false } = {}) {
  const rows = await cached("events:all", EVENT_LIST_CACHE_TTL_MS, async () => (
    await selectAll(eventsTable(), { limit: 2000, order: "created_at.desc,event_code.desc" })
  ), { force });

  const needle = text(search, 200).toLowerCase();
  const requestedStatus = String(status || "all").trim().toLowerCase();
  const normalizedStatus = requestedStatus && requestedStatus !== "all" ? normalizeStatus(requestedStatus) : "all";
  return (Array.isArray(rows) ? rows : []).map(serializeEvent).filter((event) => {
    if (!includeArchived && event.isArchived) return false;
    if (normalizedStatus !== "all" && event.status !== normalizedStatus) return false;
    if (!needle) return true;
    return [event.eventCode, event.eventName, event.eventType, event.eventTypeCustom, event.organizationName, event.governorate, event.requesterName]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

export async function getEvent(id) {
  const cleanId = uuid(id);
  if (!cleanId) return null;
  const row = await selectById(eventsTable(), cleanId);
  return row ? serializeEvent(row) : null;
}

export async function listEventComponents({ activeOnly = false, force = false } = {}) {
  const key = activeOnly ? "event-components:active" : "event-components:all";
  const rows = await cached(key, REFERENCE_CACHE_TTL_MS, async () => {
    const params = {
      select: "*",
      order: "is_active.desc,name.asc",
      limit: "1000",
    };
    if (activeOnly) params.is_active = "eq.true";
    return await select(componentsTable(), params);
  }, { force });
  return (Array.isArray(rows) ? rows : []).map(serializeComponent);
}

export async function listEventTypes({ force = false } = {}) {
  const rows = await cached("event-types", REFERENCE_CACHE_TTL_MS, async () => (
    await selectAll(typesTable(), { limit: 1000, order: "label.asc" })
  ), { force });
  const standard = STANDARD_TYPES.map((item) => ({ ...item }));
  const seenCodes = new Set(standard.map((item) => item.code));
  const custom = (Array.isArray(rows) ? rows : [])
    .map(serializeType)
    .filter((item) => item.code && item.label && item.isActive !== false && !seenCodes.has(item.code));
  return [...standard, ...custom];
}

export async function listEventComponentCategories({ force = false } = {}) {
  const rows = await cached("event-component-categories", REFERENCE_CACHE_TTL_MS, async () => (
    await selectAll(categoriesTable(), { limit: 1000, order: "label.asc" })
  ), { force });
  const standard = STANDARD_COMPONENT_CATEGORIES.map((item) => ({ ...item }));
  const seenCodes = new Set(standard.map((item) => item.code));
  const custom = (Array.isArray(rows) ? rows : [])
    .map(serializeCategory)
    .filter((item) => item.code && item.label && item.isActive !== false && !seenCodes.has(item.code));
  return [...standard, ...custom];
}

export async function listGovernorateRates({ includeInactive = false, force = false } = {}) {
  const key = includeInactive ? "event-rates:all" : "event-rates:active";
  const rows = await cached(key, RATES_CACHE_TTL_MS, async () => {
    const params = {
      select: "*",
      order: "sort_order.asc,area_name.asc",
      limit: "1000",
    };
    if (!includeInactive) params.is_active = "eq.true";
    return await select(ratesTable(), params);
  }, { force });
  return (Array.isArray(rows) ? rows : []).map(serializeRate).filter((item) => item.areaName);
}

function token(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hasEventRequestsAdminAccess(account = {}) {
  const name = token(account?.name || account?.username);
  const position = token(account?.position);
  if (name === "admin" || position.includes("admin")) return true;
  const rows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  return rows.some((row) => {
    const candidates = [row?.pageName, row?.pageKey, row?.routePath, ...(Array.isArray(row?.aliases) ? row.aliases : [])]
      .map(token)
      .filter(Boolean);
    return candidates.some((candidate) => candidate === "eventrequests" || candidate === "events")
      && String(row?.accessLevel || row?.access_level || "").trim().toLowerCase() === "admin";
  });
}

export async function loadDirectEventsPageData({ mode = "events", editId = "" } = {}) {
  const config = {
    events: { pages: ["Event Requests", "Event Calendar"] },
    calendar: { pages: ["Event Calendar"] },
    components: { pages: ["Event Components"] },
    new: { pages: ["Event Requests"] },
  }[mode];
  if (!config) return null;

  const gate = await getDirectSessionAccountGate(config.pages);
  if (!gate) return null;
  if (!gate.ok) return { ok: false, status: gate.status, error: gate.error, account: gate.account || null, source: "direct-session" };

  try {
    if (mode === "events" || mode === "calendar") {
      const events = await listEvents();
      return { ok: true, status: 200, account: gate.account, events, warnings: [], source: "supabase-next" };
    }

    if (mode === "components") {
      const [components, categories] = await Promise.all([
        listEventComponents(),
        listEventComponentCategories(),
      ]);
      return { ok: true, status: 200, account: gate.account, components, categories, warnings: [], source: "supabase-next" };
    }

    const [types, components, events, rates, event] = await Promise.all([
      listEventTypes(),
      listEventComponents({ activeOnly: true }),
      listEvents(),
      listGovernorateRates(),
      editId ? getEvent(editId) : Promise.resolve(null),
    ]);
    return {
      ok: true,
      status: 200,
      account: gate.account,
      types,
      components,
      events,
      rates,
      canEditRates: hasEventRequestsAdminAccess(gate.account),
      event,
      warnings: [],
      source: "supabase-next",
    };
  } catch {
    return null;
  }
}

export function eventsDataError(error) {
  const raw = String(error?.message || "");
  return /event_components|event_type_catalog|event_component_category_catalog|event_governorate_transport_rates|events|relation .* does not exist|Could not find the table|PGRST205|42P01|schema cache/i.test(raw)
    ? "Events tables are not installed. Run the latest Events component categories SQL migration in Supabase first."
    : raw || "Events request failed.";
}

export const __eventsDataTest = {
  normalizeType,
  normalizeStatus,
  normalizeCategory,
  serializeEvent,
  serializeComponent,
};
