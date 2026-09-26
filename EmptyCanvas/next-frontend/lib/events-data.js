import "server-only";

import { getDirectAccountGate } from "./products-auth";
import { deleteById, insert, select, selectAll, selectById, updateById, uploadStorageObject } from "./supabase-rest";

const EVENT_LIST_CACHE_TTL_MS = 1_500;
const REFERENCE_CACHE_TTL_MS = 15_000;
const RATES_CACHE_TTL_MS = 5_000;

const listCache = new Map();
const inflight = new Map();

let eventListProjectionSupported = null;
let componentProjectionSupported = null;
let typeProjectionSupported = null;
let categoryProjectionSupported = null;
let rateProjectionSupported = null;

// Event cards and the calendar only need a small subset of the event row.
// Heavy JSON/text fields (projects, component arrays, notes, audience, contact
// details, etc.) stay on the detail path and are fetched lazily by event ID.
const EVENT_LIST_SELECT = [
  "id",
  "event_code",
  "event_name",
  "event_type",
  "event_type_custom",
  "status",
  "is_archived",
  "archived_at",
  "organization_name",
  "contact_person",
  "event_start_date",
  "event_end_date",
  "governorate",
  "location_url",
  "total_cost",
  "requester_name",
  "created_by_user_id",
  "created_at",
  "updated_at",
].join(",");

const EVENT_COMPONENT_LIST_SELECT = [
  "id",
  "name",
  "category",
  "description",
  "default_quantity",
  "ownership_type",
  "operating_cost",
  "rental_cost",
  "photo_url",
  "photo_urls",
  "attachment_files",
  "link_url",
  "is_active",
  "created_at",
  "updated_at",
].join(",");

const EVENT_TYPE_LIST_SELECT = "code,label,is_active,created_at";
const EVENT_CATEGORY_LIST_SELECT = "code,label,is_active,created_at";
const EVENT_RATE_LIST_SELECT = "id,area_name,transport_cost,is_active,sort_order,updated_at";

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

function serializeEventSummary(row = {}) {
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
    eventStartDate: row?.event_start_date || null,
    eventEndDate: row?.event_end_date || null,
    governorate: text(row?.governorate, 120),
    locationUrl: httpUrl(row?.location_url, 1000),
    totalCost: money(row?.total_cost, 0),
    requesterName: text(row?.requester_name, 160),
    createdByUserId: text(row?.created_by_user_id, 180) || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    summaryFormat: "compact-v1",
  };
}

function serializeComponent(row = {}) {
  const ownershipType = normalizeOwnership(row?.ownership_type || row?.ownershipType);
  const operatingCost = money(row?.operating_cost ?? row?.operatingCost, 0);
  const rentalCost = ownershipType === "external_rental" ? money(row?.rental_cost ?? row?.rentalCost, 0) : 0;
  const photoUrls = [];
  const seenPhotos = new Set();
  for (const value of [row?.photo_url || row?.photoUrl, ...array(row?.photo_urls || row?.photoUrls)]) {
    const url = httpUrl(value, 2000);
    if (!url || seenPhotos.has(url)) continue;
    seenPhotos.add(url);
    photoUrls.push(url);
  }
  const attachments = [];
  const seenFiles = new Set();
  for (const value of array(row?.attachment_files || row?.attachmentFiles || row?.attachments)) {
    const item = typeof value === "string" ? { url: value } : (value || {});
    const url = httpUrl(item?.url || item?.fileUrl || item?.file_url, 2000);
    if (!url || seenFiles.has(url)) continue;
    seenFiles.add(url);
    attachments.push({
      url,
      name: text(item?.name || item?.fileName || item?.file_name, 180) || "Attachment",
      mime: text(item?.mime || item?.type, 120),
      size: number(item?.size, { min: 0, max: 50 * 1024 * 1024, fallback: 0, integer: true }),
    });
    if (attachments.length >= 8) break;
  }
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
    photoUrl: photoUrls[0] || "",
    photoUrls,
    attachments,
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
  const rows = await cached("events:all", EVENT_LIST_CACHE_TTL_MS, async () => {
    if (eventListProjectionSupported !== false) {
      try {
        const compactRows = await selectAll(eventsTable(), {
          limit: 2000,
          order: "created_at.desc,event_code.desc",
          select: EVENT_LIST_SELECT,
          profileName: "events.list-compact",
        });
        eventListProjectionSupported = true;
        return compactRows;
      } catch {
        eventListProjectionSupported = false;
      }
    }
    return await selectAll(eventsTable(), {
      limit: 2000,
      order: "created_at.desc,event_code.desc",
      profileName: "events.list-fallback",
    });
  }, { force });

  const needle = text(search, 200).toLowerCase();
  const requestedStatus = String(status || "all").trim().toLowerCase();
  const normalizedStatus = requestedStatus && requestedStatus !== "all" ? normalizeStatus(requestedStatus) : "all";
  return (Array.isArray(rows) ? rows : []).map(serializeEventSummary).filter((event) => {
    if (!includeArchived && event.isArchived) return false;
    if (normalizedStatus !== "all" && event.status !== normalizedStatus) return false;
    if (!needle) return true;
    return [event.eventCode, event.eventName, event.eventType, event.eventTypeCustom, event.organizationName, event.governorate, event.requesterName, event.contactPerson]
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
    const base = {
      order: "is_active.desc,name.asc",
      limit: "1000",
      ...(activeOnly ? { is_active: "eq.true" } : {}),
    };
    if (componentProjectionSupported !== false) {
      try {
        const compactRows = await select(componentsTable(), { ...base, select: EVENT_COMPONENT_LIST_SELECT }, { profileName: "events.components-compact" });
        componentProjectionSupported = true;
        return compactRows;
      } catch {
        componentProjectionSupported = false;
      }
    }
    return await select(componentsTable(), { ...base, select: "*" }, { profileName: "events.components-fallback" });
  }, { force });
  return (Array.isArray(rows) ? rows : []).map(serializeComponent);
}

export async function listEventTypes({ force = false } = {}) {
  const rows = await cached("event-types", REFERENCE_CACHE_TTL_MS, async () => {
    if (typeProjectionSupported !== false) {
      try {
        const compactRows = await selectAll(typesTable(), {
          limit: 1000,
          order: "label.asc",
          select: EVENT_TYPE_LIST_SELECT,
          profileName: "events.types-compact",
        });
        typeProjectionSupported = true;
        return compactRows;
      } catch {
        typeProjectionSupported = false;
      }
    }
    return await selectAll(typesTable(), { limit: 1000, order: "label.asc", profileName: "events.types-fallback" });
  }, { force });
  const standard = STANDARD_TYPES.map((item) => ({ ...item }));
  const seenCodes = new Set(standard.map((item) => item.code));
  const custom = (Array.isArray(rows) ? rows : [])
    .map(serializeType)
    .filter((item) => item.code && item.label && item.isActive !== false && !seenCodes.has(item.code));
  return [...standard, ...custom];
}

export async function listEventComponentCategories({ force = false } = {}) {
  const rows = await cached("event-component-categories", REFERENCE_CACHE_TTL_MS, async () => {
    if (categoryProjectionSupported !== false) {
      try {
        const compactRows = await selectAll(categoriesTable(), {
          limit: 1000,
          order: "label.asc",
          select: EVENT_CATEGORY_LIST_SELECT,
          profileName: "events.categories-compact",
        });
        categoryProjectionSupported = true;
        return compactRows;
      } catch {
        categoryProjectionSupported = false;
      }
    }
    return await selectAll(categoriesTable(), { limit: 1000, order: "label.asc", profileName: "events.categories-fallback" });
  }, { force });
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
    const base = {
      order: "sort_order.asc,area_name.asc",
      limit: "1000",
      ...(includeInactive ? {} : { is_active: "eq.true" }),
    };
    if (rateProjectionSupported !== false) {
      try {
        const compactRows = await select(ratesTable(), { ...base, select: EVENT_RATE_LIST_SELECT }, { profileName: "events.rates-compact" });
        rateProjectionSupported = true;
        return compactRows;
      } catch {
        rateProjectionSupported = false;
      }
    }
    return await select(ratesTable(), { ...base, select: "*" }, { profileName: "events.rates-fallback" });
  }, { force });
  return (Array.isArray(rows) ? rows : []).map(serializeRate).filter((item) => item.areaName);
}


function eventDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function googleMapsUrl(value, maxLength = 2000) {
  const raw = httpUrl(value, maxLength);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = String(url.hostname || "").toLowerCase().replace(/^www\./, "");
    const path = String(url.pathname || "");
    const isGoogleDomain = /(^|\.)google\.[a-z.]+$/i.test(host);
    const isMapsShortLink = host === "maps.app.goo.gl" || (host === "goo.gl" && /^\/maps(?:\/|$)/i.test(path));
    const isGoogleMapsPath = isGoogleDomain && (
      host === "maps.google.com"
      || /^\/maps(?:\/|$)/i.test(path)
      || /(?:^|[?&])(?:q|query|ll|destination|origin|place_id)=/i.test(url.search)
    );
    return isMapsShortLink || isGoogleMapsPath ? url.href.slice(0, maxLength) : "";
  } catch {
    return "";
  }
}

function roundMoney(value) {
  return Math.round(Math.max(0, Number(value || 0) || 0) * 100) / 100;
}

function governorateKey(value) {
  return text(value, 120).toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function accountMemberId(account = {}) {
  return uuid(account?.teamMemberId || account?.userSupabaseId || account?.userId || account?.id) || null;
}

function accountName(account = {}) {
  return text(account?.name || account?.username, 160);
}

function clearEventsCache() {
  listCache.clear();
  inflight.clear();
}

function customCode(label, prefix, usedCodes = new Set()) {
  const baseSlug = typeCode(label).replace(/^custom_/, "") || prefix;
  const base = `custom_${baseSlug.slice(0, 52)}`;
  let code = base;
  let index = 2;
  while (usedCodes.has(code)) {
    code = `${base.slice(0, Math.max(1, 66 - String(index).length))}_${index}`;
    index += 1;
  }
  return code;
}

function labelKey(value) {
  return text(value, 80).toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export async function createEventTypeOption(label) {
  const cleanLabel = text(label, 80);
  if (!cleanLabel) {
    const error = new Error("Event type name is required.");
    error.status = 400;
    throw error;
  }
  const existing = await listEventTypes({ force: true });
  const same = existing.find((item) => labelKey(item.label) === labelKey(cleanLabel));
  if (same) return same;
  const used = new Set(existing.map((item) => item.code).filter(Boolean));
  const row = await insert(typesTable(), { code: customCode(cleanLabel, "event_type", used), label: cleanLabel, is_active: true });
  clearEventsCache();
  const saved = serializeType(row || {});
  if (!saved.code || !saved.label) {
    const error = new Error("Event type could not be saved.");
    error.status = 500;
    throw error;
  }
  return saved;
}

async function resolveEventType(body = {}) {
  const requested = normalizeType(body?.eventType || body?.event_type);
  if (EVENT_TYPES.has(requested)) {
    const customLabel = text(body?.eventTypeCustom || body?.event_type_custom, 80);
    if (requested === "other" && customLabel) {
      const custom = await createEventTypeOption(customLabel);
      return { code: custom.code, label: custom.label };
    }
    return { code: requested, label: null };
  }
  const options = await listEventTypes({ force: true });
  const matched = options.find((item) => item.code === requested && item.isCustom);
  if (!matched) {
    const error = new Error("The selected event type is not available. Please select an existing type or add a new one under Other.");
    error.status = 400;
    throw error;
  }
  return { code: matched.code, label: matched.label };
}

export async function createEventComponentCategoryOption(label) {
  const cleanLabel = text(label, 80);
  if (!cleanLabel) {
    const error = new Error("Component category name is required.");
    error.status = 400;
    throw error;
  }
  const existing = await listEventComponentCategories({ force: true });
  const same = existing.find((item) => labelKey(item.label) === labelKey(cleanLabel));
  if (same) return same;
  const used = new Set(existing.map((item) => item.code).filter(Boolean));
  const row = await insert(categoriesTable(), { code: customCode(cleanLabel, "component_category", used), label: cleanLabel, is_active: true });
  clearEventsCache();
  const saved = serializeCategory(row || {});
  if (!saved.code || !saved.label) {
    const error = new Error("Component category could not be saved.");
    error.status = 500;
    throw error;
  }
  return saved;
}

async function resolveComponentCategory(body = {}) {
  const requested = normalizeCategory(body?.category || body?.componentCategory || body?.component_category);
  if (COMPONENT_CATEGORIES.has(requested)) {
    const customLabel = text(body?.categoryCustom || body?.componentCategoryCustom || body?.component_category_custom, 80);
    if (requested === "other" && customLabel) {
      const custom = await createEventComponentCategoryOption(customLabel);
      return { code: custom.code, label: custom.label };
    }
    return { code: requested, label: null };
  }
  const options = await listEventComponentCategories({ force: true });
  const matched = options.find((item) => item.code === requested && item.isCustom);
  if (!matched) {
    const error = new Error("The selected component category is not available. Please select an existing category or add a new one under Other.");
    error.status = 400;
    throw error;
  }
  return { code: matched.code, label: matched.label };
}

async function resolveComponentRows(value, expectedCategory = "") {
  const submittedRows = normalizeComponentRows(value);
  if (!submittedRows.length) return [];
  const expected = expectedCategory ? normalizeCategory(expectedCategory) : "";
  const catalog = new Map((await listEventComponents({ force: true })).map((item) => [item.id, item]));
  return submittedRows.map((submitted) => {
    const component = submitted.componentId ? catalog.get(submitted.componentId) : null;
    if (!component) return submitted;
    if (expected && String(component.category || "") !== expected) {
      const labels = { project: "Project Resource", marketing_material: "Marketing Material", venue_equipment: "Venue Equipment" };
      const error = new Error(`Selected component "${component.name}" must be from the ${labels[expected] || "required"} category.`);
      error.status = 400;
      throw error;
    }
    const ownershipType = normalizeOwnership(component.ownershipType);
    const operatingCost = money(component.operatingCost, 0);
    const rentalCost = ownershipType === "external_rental" ? money(component.rentalCost, 0) : 0;
    const unitCost = componentUnitCost(ownershipType, operatingCost, rentalCost);
    return {
      componentId: component.id || submitted.componentId,
      name: component.name || submitted.name,
      quantity: submitted.quantity,
      notes: submitted.notes,
      ownershipType,
      operatingCost,
      rentalCost,
      unitCost,
      totalCost: Math.round(unitCost * submitted.quantity * 100) / 100,
      linkUrl: component.linkUrl || "",
      photoUrl: component.photoUrl || "",
    };
  });
}

async function governorateTransportQuote(areaName) {
  const governorate = text(areaName, 120);
  if (!governorate) {
    const error = new Error("Governorate is required to calculate transport cost.");
    error.status = 400;
    throw error;
  }
  const rates = await listGovernorateRates({ force: true });
  const rate = rates.find((item) => governorateKey(item.areaName) === governorateKey(governorate));
  if (!rate) {
    const error = new Error(`Transport cost for ${governorate} is not configured. Ask an Events Admin to add this governorate or area.`);
    error.status = 400;
    throw error;
  }
  const transportRate = money(rate.transportCost, 0);
  return { governorate: rate.areaName, transportRate, transportCost: roundMoney(transportRate * 2), calculation: "governorate_x2" };
}

function workingCost(projects = [], marketingMaterials = [], venueRequirements = []) {
  const projectCost = (Array.isArray(projects) ? projects : []).reduce((total, row) => total + money(row?.workingCost ?? row?.working_cost, 0), 0);
  const componentCost = [...(Array.isArray(marketingMaterials) ? marketingMaterials : []), ...(Array.isArray(venueRequirements) ? venueRequirements : [])]
    .reduce((total, row) => total + money(row?.totalCost ?? row?.total_cost, 0), 0);
  return roundMoney(projectCost + componentCost);
}

async function eventWriteRow(body = {}, account = {}) {
  const startDate = eventDateTime(body?.eventStartDate || body?.event_start_date);
  const endDate = eventDateTime(body?.eventEndDate || body?.event_end_date);
  if (!startDate) {
    const error = new Error("Event start date and time are required.");
    error.status = 400;
    throw error;
  }
  if (endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
    const error = new Error("End date and time cannot be before the start date and time.");
    error.status = 400;
    throw error;
  }
  const eventName = text(body?.eventName || body?.event_name, 240);
  if (!eventName) {
    const error = new Error("Event name is required.");
    error.status = 400;
    throw error;
  }
  const locationUrl = googleMapsUrl(body?.locationUrl || body?.location_url, 2000);
  if (!locationUrl) {
    const error = new Error("Google Maps / Location URL is required. Paste a Google Maps link such as https://www.google.com/maps/... or https://maps.app.goo.gl/...");
    error.status = 400;
    throw error;
  }
  const governorate = text(body?.governorate, 120);
  if (!governorate) {
    const error = new Error("Governorate is required.");
    error.status = 400;
    throw error;
  }
  const eventType = await resolveEventType(body);
  const projects = normalizeProjects(body?.projects);
  const marketingMaterials = await resolveComponentRows(body?.marketingMaterials || body?.marketing_materials, "marketing_material");
  const venueRequirements = await resolveComponentRows(body?.venueRequirements || body?.venue_requirements, "venue_equipment");
  const computedWorkingCost = workingCost(projects, marketingMaterials, venueRequirements);
  const transport = await governorateTransportQuote(governorate);
  return {
    event_name: eventName,
    event_type: eventType.code,
    event_type_custom: eventType.label || null,
    status: "submitted",
    organization_name: text(body?.organizationName || body?.organization_name, 240) || null,
    contact_person: text(body?.contactPerson || body?.contact_person, 160) || null,
    contact_phone: text(body?.contactPhone || body?.contact_phone, 80) || null,
    contact_email: text(body?.contactEmail || body?.contact_email, 200) || null,
    event_start_date: startDate,
    event_end_date: endDate,
    expected_attendees: number(body?.expectedAttendees || body?.expected_attendees, { min: 0, max: 1000000, fallback: 0, integer: true }),
    audience: longText(body?.audience, 1000) || null,
    projects,
    marketing_materials: marketingMaterials,
    venue_requirements: venueRequirements,
    venue_name: text(body?.venueName || body?.venue_name, 240) || null,
    venue_type: text(body?.venueType || body?.venue_type, 120) || null,
    governorate: transport.governorate || governorate,
    location_url: locationUrl,
    venue_setup_time: eventDateTime(body?.venueSetupTime || body?.venue_setup_time) || null,
    requires_power: bool(body?.requiresPower || body?.requires_power),
    requires_internet: bool(body?.requiresInternet || body?.requires_internet),
    requires_sound_system: bool(body?.requiresSoundSystem || body?.requires_sound_system),
    venue_notes: longText(body?.venueNotes || body?.venue_notes, 3000) || null,
    transport_rate: transport.transportRate,
    transport_calculation: transport.calculation,
    working_cost: computedWorkingCost,
    transport_cost: transport.transportCost,
    total_cost: roundMoney(computedWorkingCost + transport.transportCost),
    requester_name: accountName(account) || text(body?.requesterName, 160) || null,
    created_by_user_id: accountMemberId(account),
    is_archived: false,
    archived_at: null,
  };
}

export async function createEventRequest(body = {}, account = {}) {
  const row = await insert(eventsTable(), await eventWriteRow(body, account));
  clearEventsCache();
  return serializeEvent(row || {});
}

export async function updateEventRequest(id, body = {}, account = {}) {
  const cleanId = uuid(id);
  if (!cleanId) {
    const error = new Error("Invalid event ID.");
    error.status = 400;
    throw error;
  }
  const existing = await selectById(eventsTable(), cleanId);
  if (!existing) {
    const error = new Error("Event request was not found.");
    error.status = 404;
    throw error;
  }
  const patch = await eventWriteRow(body, account);
  patch.status = normalizeStatus(existing?.status);
  patch.requester_name = existing?.requester_name || patch.requester_name || null;
  patch.created_by_user_id = existing?.created_by_user_id || patch.created_by_user_id || null;
  patch.is_archived = bool(existing?.is_archived);
  patch.archived_at = existing?.archived_at || null;
  const row = await updateById(eventsTable(), cleanId, patch);
  clearEventsCache();
  return serializeEvent(row || existing);
}

export function eventWorkflowTransition(targetStatus) {
  const to = normalizeStatus(targetStatus);
  if (to === "in_progress") return { action: "approve", from: "submitted", to };
  if (to === "completed") return { action: "deliver", from: "in_progress", to };
  return null;
}

export async function transitionEventRequest(id, targetStatus) {
  const cleanId = uuid(id);
  const transition = eventWorkflowTransition(targetStatus);
  if (!cleanId || !transition) {
    const error = new Error("Invalid event request workflow action.");
    error.status = 400;
    throw error;
  }
  const existing = await selectById(eventsTable(), cleanId);
  if (!existing) {
    const error = new Error("Event request was not found.");
    error.status = 404;
    throw error;
  }
  const currentStatus = normalizeStatus(existing?.status);
  if (currentStatus !== transition.from) {
    const error = new Error(`This action is only available while the request is ${transition.from.replace("_", " ")}.`);
    error.status = 409;
    throw error;
  }
  const row = await updateById(eventsTable(), cleanId, { status: transition.to });
  clearEventsCache();
  return { action: transition.action, event: serializeEvent(row || existing) };
}

export async function cancelEventRequest(id) {
  const cleanId = uuid(id);
  if (!cleanId) {
    const error = new Error("Invalid event ID.");
    error.status = 400;
    throw error;
  }
  const existing = await selectById(eventsTable(), cleanId);
  if (!existing) {
    const error = new Error("Event request was not found.");
    error.status = 404;
    throw error;
  }
  if (normalizeStatus(existing?.status) === "cancelled") {
    const error = new Error("This event request is already cancelled.");
    error.status = 409;
    throw error;
  }
  const row = await updateById(eventsTable(), cleanId, { status: "cancelled" });
  clearEventsCache();
  return serializeEvent(row || existing);
}

export async function archiveEventRequest(id) {
  const cleanId = uuid(id);
  if (!cleanId) {
    const error = new Error("Invalid event ID.");
    error.status = 400;
    throw error;
  }
  const row = await updateById(eventsTable(), cleanId, { is_archived: true, archived_at: new Date().toISOString() });
  if (!row) {
    const error = new Error("Event request was not found.");
    error.status = 404;
    throw error;
  }
  clearEventsCache();
  return serializeEvent(row);
}

function photoUrlList(value, fallbackUrl = "") {
  const values = [...array(value)];
  if (fallbackUrl) values.unshift(fallbackUrl);
  const seen = new Set();
  const urls = [];
  for (const value of values) {
    const url = httpUrl(value, 2000);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= 8) break;
  }
  return urls;
}

function attachmentList(value) {
  const seen = new Set();
  const files = [];
  for (const item of array(value)) {
    const candidate = typeof item === "string" ? { url: item } : (item || {});
    const url = httpUrl(candidate?.url || candidate?.fileUrl || candidate?.file_url, 2000);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    files.push({
      url,
      name: text(candidate?.name || candidate?.fileName || candidate?.file_name || "Attachment", 180) || "Attachment",
      mime: text(candidate?.mime || candidate?.type, 120),
      size: number(candidate?.size, { min: 0, max: 50 * 1024 * 1024, fallback: 0, integer: true }),
    });
    if (files.length >= 8) break;
  }
  return files;
}

function componentPayload(body = {}, existing = null) {
  const name = text(body?.name, 180);
  if (!name) {
    const error = new Error("Component name is required.");
    error.status = 400;
    throw error;
  }
  const rawLink = String(body?.linkUrl || body?.link_url || "").trim();
  const linkUrl = httpUrl(rawLink, 1000);
  if (rawLink && !linkUrl) {
    const error = new Error("Link must start with http:// or https://.");
    error.status = 400;
    throw error;
  }
  const hasPhotos = Object.prototype.hasOwnProperty.call(body, "existingPhotoUrls") || Object.prototype.hasOwnProperty.call(body, "existing_photo_urls");
  const hasAttachments = Object.prototype.hasOwnProperty.call(body, "existingAttachments") || Object.prototype.hasOwnProperty.call(body, "existing_attachments");
  const photos = hasPhotos
    ? photoUrlList(body?.existingPhotoUrls ?? body?.existing_photo_urls)
    : photoUrlList(existing?.photo_urls || existing?.photoUrls, existing?.photo_url || existing?.photoUrl || "");
  const attachments = hasAttachments
    ? attachmentList(body?.existingAttachments ?? body?.existing_attachments)
    : attachmentList(existing?.attachment_files || existing?.attachmentFiles || existing?.attachments);
  if (photos.length > 8 || attachments.length > 8) {
    const error = new Error("An event component can contain up to 8 photos and 8 files.");
    error.status = 400;
    throw error;
  }
  const ownershipType = normalizeOwnership(body?.ownershipType || body?.ownership_type);
  return { name, linkUrl, photos, attachments, ownershipType };
}

export async function createEventComponent(body = {}) {
  const base = componentPayload(body);
  const category = await resolveComponentCategory(body);
  const row = await insert(componentsTable(), {
    name: base.name,
    category: category.code,
    description: longText(body?.description, 2000) || null,
    default_quantity: number(body?.defaultQuantity || body?.default_quantity, { min: 0, max: 100000, fallback: 1 }),
    ownership_type: base.ownershipType,
    operating_cost: money(body?.operatingCost ?? body?.operating_cost, 0),
    rental_cost: base.ownershipType === "external_rental" ? money(body?.rentalCost ?? body?.rental_cost, 0) : 0,
    photo_url: base.photos[0] || null,
    photo_urls: base.photos,
    attachment_files: base.attachments,
    link_url: base.linkUrl || null,
    is_active: body?.isActive !== false,
  });
  clearEventsCache();
  return serializeComponent(row || {});
}

export async function updateEventComponent(id, body = {}) {
  const cleanId = uuid(id);
  if (!cleanId) {
    const error = new Error("Invalid component ID.");
    error.status = 400;
    throw error;
  }
  const existing = await selectById(componentsTable(), cleanId);
  if (!existing) {
    const error = new Error("Event component was not found.");
    error.status = 404;
    throw error;
  }
  const base = componentPayload(body, existing);
  const category = await resolveComponentCategory(body);
  const row = await updateById(componentsTable(), cleanId, {
    name: base.name,
    category: category.code,
    description: longText(body?.description, 2000) || null,
    default_quantity: number(body?.defaultQuantity || body?.default_quantity, { min: 0, max: 100000, fallback: 1 }),
    ownership_type: base.ownershipType,
    operating_cost: money(body?.operatingCost ?? body?.operating_cost, 0),
    rental_cost: base.ownershipType === "external_rental" ? money(body?.rentalCost ?? body?.rental_cost, 0) : 0,
    photo_url: base.photos[0] || null,
    photo_urls: base.photos,
    attachment_files: base.attachments,
    link_url: base.linkUrl || null,
    is_active: body?.isActive !== false,
  });
  clearEventsCache();
  return serializeComponent(row || existing);
}

export async function deleteEventComponent(id) {
  const cleanId = uuid(id);
  if (!cleanId) {
    const error = new Error("Invalid component ID.");
    error.status = 400;
    throw error;
  }
  await deleteById(componentsTable(), cleanId);
  clearEventsCache();
  return true;
}

function cleanAssetFilename(value = "") {
  const raw = String(value || "event-file").trim() || "event-file";
  return raw.replace(/[^a-z0-9._-]/gi, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "event-file";
}

function parseDataUrl(value = "") {
  const match = String(value || "").match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) {
    const error = new Error("Uploaded file data is invalid.");
    error.status = 400;
    throw error;
  }
  const mime = String(match[1] || "application/octet-stream").trim().toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) {
    const error = new Error("Uploaded file data is invalid.");
    error.status = 400;
    throw error;
  }
  return { mime, buffer };
}

const EVENT_ATTACHMENT_EXTENSIONS = new Set(["pdf", "zip", "rar", "7z", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"]);
function attachmentExtension(value = "") {
  const match = String(value || "").trim().toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : "";
}
function attachmentAllowed(fileName = "", mime = "") {
  const extension = attachmentExtension(fileName);
  if (!EVENT_ATTACHMENT_EXTENSIONS.has(extension)) return false;
  const normalizedMime = String(mime || "").trim().toLowerCase();
  if (!normalizedMime || normalizedMime === "application/octet-stream") return true;
  if (extension === "pdf") return normalizedMime === "application/pdf";
  if (["zip", "rar", "7z"].includes(extension)) return /(zip|rar|7z|compressed|octet-stream)/i.test(normalizedMime);
  if (["txt", "csv"].includes(extension)) return /^text\//i.test(normalizedMime) || /csv/i.test(normalizedMime);
  return /(word|officedocument|excel|spreadsheet|powerpoint|presentation|msword|ms-excel|ms-powerpoint|octet-stream)/i.test(normalizedMime);
}

export async function uploadEventComponentAsset({ kind = "photo", dataUrl = "", fileName = "" } = {}) {
  const { mime, buffer } = parseDataUrl(dataUrl);
  const originalName = text(fileName, 180) || (kind === "photo" ? "component-photo" : "attachment");
  const safeName = cleanAssetFilename(originalName);
  if (kind === "photo") {
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(mime)) {
      const error = new Error("Component photos must be PNG, JPG, WEBP, or GIF images.");
      error.status = 400;
      throw error;
    }
    if (buffer.length > 8 * 1024 * 1024) {
      const error = new Error("Each component photo must be 8 MB or less.");
      error.status = 413;
      throw error;
    }
  } else {
    if (!attachmentAllowed(originalName, mime)) {
      const error = new Error("Supported files: PDF, ZIP, RAR, 7Z, Word, Excel, PowerPoint, TXT, and CSV.");
      error.status = 400;
      throw error;
    }
    if (buffer.length > 2.6 * 1024 * 1024) {
      const error = new Error("Each non-image file must be 2.6 MB or less.");
      error.status = 413;
      throw error;
    }
  }
  const objectPath = kind === "photo"
    ? `events/components/${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`
    : `events/components/files/${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;
  const uploaded = await uploadStorageObject(objectPath, buffer, { contentType: mime, upsert: false });
  if (!uploaded?.publicUrl) throw new Error("Supabase Storage did not return a public event component URL.");
  return {
    url: uploaded.publicUrl,
    ...(kind === "photo" ? {} : { file: { url: uploaded.publicUrl, name: originalName, mime, size: buffer.length } }),
  };
}

export async function saveGovernorateRates(body = {}, account = {}) {
  const requested = array(body?.rates).slice(0, 200);
  if (!requested.length) {
    const error = new Error("Add at least one governorate or area rate.");
    error.status = 400;
    throw error;
  }
  const cleaned = [];
  const seen = new Set();
  for (let index = 0; index < requested.length; index += 1) {
    const source = requested[index] || {};
    const areaName = text(source?.areaName || source?.area_name, 120);
    if (!areaName) continue;
    const key = governorateKey(areaName);
    if (seen.has(key)) {
      const error = new Error(`Duplicate governorate/area: ${areaName}.`);
      error.status = 400;
      throw error;
    }
    seen.add(key);
    cleaned.push({
      id: uuid(source?.id), areaName,
      transportCost: money(source?.transportCost ?? source?.transport_cost, 0),
      isActive: source?.isActive !== false,
      sortOrder: number(source?.sortOrder ?? source?.sort_order, { min: 0, max: 100000, fallback: index + 1, integer: true }),
    });
  }
  if (!cleaned.length) {
    const error = new Error("Add a valid governorate or area name.");
    error.status = 400;
    throw error;
  }
  const existing = await listGovernorateRates({ includeInactive: true, force: true });
  const existingById = new Map(existing.map((item) => [item.id, item]));
  const existingByKey = new Map(existing.map((item) => [governorateKey(item.areaName), item]));
  const saved = [];
  for (const rate of cleaned) {
    const existingRow = (rate.id && existingById.get(rate.id)) || existingByKey.get(governorateKey(rate.areaName)) || null;
    const payload = {
      area_name: rate.areaName,
      transport_cost: rate.transportCost,
      is_active: rate.isActive,
      sort_order: rate.sortOrder,
      updated_by_user_id: accountMemberId(account),
    };
    const row = existingRow?.id ? await updateById(ratesTable(), existingRow.id, payload) : await insert(ratesTable(), payload);
    saved.push(serializeRate(row || payload));
  }
  clearEventsCache();
  return saved;
}

export function hasEventComponentsAdminAccess(account = {}) {
  const name = token(account?.name || account?.username);
  const position = token(account?.position);
  if (name === "admin" || position.includes("admin")) return true;
  const rows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  return rows.some((row) => {
    const candidates = [row?.pageName, row?.pageKey, row?.routePath, ...(Array.isArray(row?.aliases) ? row.aliases : [])].map(token).filter(Boolean);
    return candidates.some((candidate) => candidate === "eventcomponents" || candidate === "events")
      && String(row?.accessLevel || row?.access_level || "").trim().toLowerCase() === "admin";
  });
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

  const gate = await getDirectAccountGate(config.pages);
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
  } catch (error) {
    return {
      ok: false,
      status: Number(error?.status) || 500,
      error: eventsDataError(error),
      account: gate.account || null,
      source: "supabase-next",
    };
  }
}

export function eventsDataError(error) {
  const raw = String(error?.message || "");
  if (/SUPABASE_STORAGE|storage bucket|Storage did not return/i.test(raw)) {
    return "Event component file upload is not configured correctly in Supabase Storage.";
  }
  if (/attachment_files/i.test(raw)) {
    return "Event component file attachments are not installed yet. Run the latest Event Components SQL migration in Supabase.";
  }
  if (/photo_urls|PGRST204/i.test(raw)) {
    return "Multiple event component photos are not installed yet. Run the latest Event Components SQL migration in Supabase.";
  }
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
