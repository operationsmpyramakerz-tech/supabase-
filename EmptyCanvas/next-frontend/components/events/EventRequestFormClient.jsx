"use client";

import { useMemo, useState } from "react";

const STANDARD_EVENT_TYPES = [
  { code: "tech_day", label: "Tech Day", isCustom: false },
  { code: "seminar", label: "Seminar", isCustom: false },
  { code: "steam_fair", label: "STEAM Fair", isCustom: false },
  { code: "competition", label: "Competition", isCustom: false },
  { code: "exhibition", label: "Exhibition", isCustom: false },
];

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function token(value) {
  return lower(value).replace(/[^a-z0-9]+/g, "");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function money(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number(value));
}

function safeHttpUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function isGoogleMapsUrl(value) {
  const safe = safeHttpUrl(value);
  if (!safe) return false;
  try {
    const url = new URL(safe);
    const host = lower(url.hostname).replace(/^www\./, "");
    const path = String(url.pathname || "");
    const isGoogle = /(^|\.)google\.[a-z.]+$/i.test(host);
    return host === "maps.app.goo.gl"
      || (host === "goo.gl" && /^\/maps(?:\/|$)/i.test(path))
      || (isGoogle && (host === "maps.google.com" || /^\/maps(?:\/|$)/i.test(path) || /(?:^|[?&])(?:q|query|ll|destination|origin|place_id)=/i.test(url.search)));
  } catch {
    return false;
  }
}

function toDateTimeLocal(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startDateValue(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return `${raw}T09:00`;
}

function toIso(value) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateKey(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function makeKey(prefix = "row") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTypes(value) {
  const merged = [...STANDARD_EVENT_TYPES];
  const seen = new Set(merged.map((item) => item.code));
  for (const item of Array.isArray(value) ? value : []) {
    const code = text(item?.code);
    const label = text(item?.label);
    if (!code || !label || seen.has(code)) continue;
    seen.add(code);
    merged.push({ code, label, isCustom: !!item?.isCustom || /^custom_/i.test(code) });
  }
  return merged;
}

function pageAccessLevel(account) {
  const builtInAdmin = token(account?.name) === "admin" || token(account?.position).includes("admin");
  if (builtInAdmin) return "admin";
  const wanted = new Set(["eventrequests", "eventsrequests", "events", "eventsrequestsnew", "eventsnew", "eventsrequestscreate"]);
  const rank = { view: 1, edit: 2, admin: 3 };
  let best = "";
  for (const entry of Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : []) {
    const candidates = [entry?.pageName, entry?.pageKey, entry?.routePath, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])]
      .map(token)
      .filter(Boolean);
    if (!candidates.some((candidate) => wanted.has(candidate) || candidate === "eventsrequests")) continue;
    const level = lower(entry?.accessLevel || entry?.access_level);
    if ((rank[level] || 0) > (rank[best] || 0)) best = level;
  }
  if (best) return best;
  const allowed = (Array.isArray(account?.allowedPages) ? account.allowedPages : []).map(token);
  return allowed.some((item) => item === "eventrequests" || item === "events") ? "edit" : "view";
}

function apiError(body, fallback) {
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
  if (!response.ok || body?.ok === false) throw new Error(apiError(body, "The request failed."));
  return body;
}

function initialForm(event, initialStartDate) {
  if (!event) {
    return {
      eventName: "",
      eventType: "tech_day",
      eventStartDate: startDateValue(initialStartDate),
      eventEndDate: "",
      expectedAttendees: "",
      organizationName: "",
      contactPerson: "",
      contactPhone: "",
      contactEmail: "",
      audience: "",
      venueName: "",
      venueType: "",
      governorate: "",
      locationUrl: "",
      venueSetupTime: "",
      requiresPower: false,
      requiresInternet: false,
      requiresSoundSystem: false,
      venueNotes: "",
    };
  }
  return {
    eventName: text(event.eventName),
    eventType: text(event.eventType) || "tech_day",
    eventStartDate: toDateTimeLocal(event.eventStartDate),
    eventEndDate: toDateTimeLocal(event.eventEndDate),
    expectedAttendees: event.expectedAttendees || "",
    organizationName: text(event.organizationName),
    contactPerson: text(event.contactPerson),
    contactPhone: text(event.contactPhone),
    contactEmail: text(event.contactEmail),
    audience: text(event.audience),
    venueName: text(event.venueName),
    venueType: text(event.venueType),
    governorate: text(event.governorate),
    locationUrl: text(event.locationUrl),
    venueSetupTime: toDateTimeLocal(event.venueSetupTime),
    requiresPower: !!event.requiresPower,
    requiresInternet: !!event.requiresInternet,
    requiresSoundSystem: !!event.requiresSoundSystem,
    venueNotes: text(event.venueNotes),
  };
}

function componentUnitCost(component) {
  if (!component) return 0;
  const operating = number(component.operatingCost);
  const rental = lower(component.ownershipType) === "external_rental" ? number(component.rentalCost) : 0;
  return operating + rental;
}

function componentTotal(component, quantity) {
  return componentUnitCost(component) * number(quantity);
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-toast next-toast--${toast.type || "info"}`} role="status">
      <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}</span>
      <div><strong>{toast.title || "Events"}</strong><small>{toast.message}</small></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Field({ label, required, wide, children }) {
  return (
    <label className={`next-event-form-field${wide ? " is-wide" : ""}`}>
      <span>{label}{required ? <em>*</em> : null}</span>
      {children}
    </label>
  );
}

function FormSection({ number: sectionNumber, icon, title, description, action, children }) {
  return (
    <section className="next-event-form-section">
      <header>
        <span className="next-event-form-section__icon">{icon}</span>
        <div><small>Section {sectionNumber}</small><h3>{title}</h3><p>{description}</p></div>
        {action || null}
      </header>
      {children}
    </section>
  );
}

function EmptyRows({ label }) {
  return <div className="next-event-form-empty"><span>＋</span><strong>No {label} added yet</strong><small>Use the button above to add the first item.</small></div>;
}

export default function EventRequestFormClient({
  account,
  initialTypes = [],
  initialComponents = [],
  initialEvents = [],
  initialRates = [],
  initialCanEditRates = false,
  initialEvent = null,
  initialStartDate = "",
  bootstrapWarnings = [],
}) {
  const accessLevel = useMemo(() => pageAccessLevel(account), [account]);
  const viewOnly = accessLevel === "view";
  const editingId = text(initialEvent?.id);
  const [form, setForm] = useState(() => initialForm(initialEvent, initialStartDate));
  const [types, setTypes] = useState(() => normalizeTypes(initialTypes));
  const [components, setComponents] = useState(() => (Array.isArray(initialComponents) ? initialComponents : []).filter((item) => item?.isActive !== false));
  const [scheduledEvents, setScheduledEvents] = useState(() => Array.isArray(initialEvents) ? initialEvents : []);
  const [rates, setRates] = useState(() => Array.isArray(initialRates) ? initialRates : []);
  const [projects, setProjects] = useState(() => {
    const projectCatalog = (Array.isArray(initialComponents) ? initialComponents : []).filter((item) => item?.isActive !== false && text(item?.category) === "project");
    return (Array.isArray(initialEvent?.projects) ? initialEvent.projects : []).map((item, index) => {
      const matched = projectCatalog.find((component) => text(component.id) === text(item.componentId))
        || projectCatalog.find((component) => lower(component.name) === lower(item.title));
      return {
        key: `project-initial-${index}`,
        componentId: text(matched?.id || item.componentId),
        quantity: item.quantity ?? matched?.defaultQuantity ?? 1,
        workingCost: item.workingCost ?? item.working_cost ?? 0,
        description: text(item.description || item.notes),
      };
    });
  });
  const [marketing, setMarketing] = useState(() => (Array.isArray(initialEvent?.marketingMaterials) ? initialEvent.marketingMaterials : []).map((item, index) => ({
    key: `marketing-initial-${index}`, componentId: text(item.componentId), quantity: item.quantity ?? 1, notes: text(item.notes),
  })));
  const [venueRequirements, setVenueRequirements] = useState(() => (Array.isArray(initialEvent?.venueRequirements) ? initialEvent.venueRequirements : []).map((item, index) => ({
    key: `venue-initial-${index}`, componentId: text(item.componentId), quantity: item.quantity ?? 1, notes: text(item.notes),
  })));
  const [customTypeOpen, setCustomTypeOpen] = useState(false);
  const [customTypeName, setCustomTypeName] = useState("");
  const [savingType, setSavingType] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [showRateAuth, setShowRateAuth] = useState(false);
  const [ratePassword, setRatePassword] = useState("");
  const [rateAuthError, setRateAuthError] = useState("");
  const [authorizingRates, setAuthorizingRates] = useState(false);
  const [showRates, setShowRates] = useState(false);
  const [ratesDraft, setRatesDraft] = useState([]);
  const [ratesError, setRatesError] = useState("");
  const [savingRates, setSavingRates] = useState(false);
  const [ratesAuthorized, setRatesAuthorized] = useState(!!initialCanEditRates || accessLevel === "admin");

  const projectComponents = useMemo(() => components.filter((item) => text(item.category) === "project"), [components]);
  const marketingComponents = useMemo(() => components.filter((item) => text(item.category) === "marketing_material"), [components]);
  const venueComponents = useMemo(() => components.filter((item) => text(item.category) === "venue_equipment"), [components]);
  const selectedRate = useMemo(() => rates.find((rate) => rate?.isActive !== false && lower(rate.areaName) === lower(form.governorate)) || null, [rates, form.governorate]);

  const conflicts = useMemo(() => {
    const selectedStart = dateKey(form.eventStartDate);
    if (!selectedStart) return [];
    const endCandidate = dateKey(form.eventEndDate);
    const selectedEnd = endCandidate && endCandidate >= selectedStart ? endCandidate : selectedStart;
    return scheduledEvents.filter((event) => {
      if (editingId && text(event?.id) === editingId) return false;
      if (lower(event?.status) === "cancelled") return false;
      const eventStart = dateKey(event?.eventStartDate);
      const eventEnd = dateKey(event?.eventEndDate) || eventStart;
      return eventStart && eventEnd && eventStart <= selectedEnd && eventEnd >= selectedStart;
    });
  }, [scheduledEvents, form.eventStartDate, form.eventEndDate, editingId]);

  const workingCost = useMemo(() => {
    const projectCost = projects.reduce((sum, item) => sum + number(item.workingCost), 0);
    const marketingCost = marketing.reduce((sum, item) => sum + componentTotal(components.find((component) => text(component.id) === text(item.componentId)), item.quantity), 0);
    const venueCost = venueRequirements.reduce((sum, item) => sum + componentTotal(components.find((component) => text(component.id) === text(item.componentId)), item.quantity), 0);
    return projectCost + marketingCost + venueCost;
  }, [projects, marketing, venueRequirements, components]);
  const transportCost = selectedRate ? number(selectedRate.transportCost) * 2 : 0;
  const totalCost = workingCost + transportCost;

  function notify(type, title, message) {
    setToast({ type, title, message });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 5000);
  }

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    if (error) setError("");
  }

  function addProject() {
    if (viewOnly) return notify("info", "View access", "Your account can review this form but cannot change it.");
    if (!projectComponents.length) return notify("info", "Project catalogue", "There are no active Project Resource components.");
    setProjects((current) => [...current, { key: makeKey("project"), componentId: "", quantity: 1, workingCost: 0, description: "" }]);
  }

  function updateProject(key, patch) {
    setProjects((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function selectProject(key, componentId) {
    const component = components.find((item) => text(item.id) === text(componentId));
    const quantity = component?.defaultQuantity ?? 1;
    updateProject(key, {
      componentId,
      quantity,
      workingCost: component ? componentTotal(component, quantity) : 0,
    });
  }

  function addComponentRow(kind) {
    if (viewOnly) return notify("info", "View access", "Your account can review this form but cannot change it.");
    const source = kind === "marketing" ? marketingComponents : venueComponents;
    if (!source.length) return notify("info", "Event Components", `There are no active ${kind === "marketing" ? "Marketing Material" : "Venue Equipment"} components.`);
    const setter = kind === "marketing" ? setMarketing : setVenueRequirements;
    setter((current) => [...current, { key: makeKey(kind), componentId: "", quantity: 1, notes: "" }]);
  }

  function updateComponentRow(kind, key, patch) {
    const setter = kind === "marketing" ? setMarketing : setVenueRequirements;
    setter((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function selectComponent(kind, key, componentId) {
    const component = components.find((item) => text(item.id) === text(componentId));
    updateComponentRow(kind, key, { componentId, quantity: component?.defaultQuantity ?? 1 });
  }

  async function saveCustomType() {
    const label = text(customTypeName);
    if (!label) return notify("info", "Event Type", "Enter a name for the new event type.");
    setSavingType(true);
    try {
      const payload = await requestJson("/api/events/types", { method: "POST", body: JSON.stringify({ label }) });
      const nextTypes = normalizeTypes(Array.isArray(payload?.types) ? payload.types : types);
      setTypes(nextTypes);
      updateField("eventType", text(payload?.type?.code) || nextTypes[nextTypes.length - 1]?.code || "tech_day");
      setCustomTypeName("");
      setCustomTypeOpen(false);
      notify("success", "Event Type", "The new event type was saved and selected.");
    } catch (saveError) {
      notify("error", "Event Type", saveError?.message || "Could not save the event type.");
    } finally {
      setSavingType(false);
    }
  }

  async function refreshReferenceData() {
    setRefreshing(true);
    try {
      const [typePayload, componentPayload, eventPayload, ratePayload] = await Promise.all([
        requestJson(`/api/events/types?_ts=${Date.now()}`),
        requestJson(`/api/events/components?activeOnly=1&_ts=${Date.now()}`),
        requestJson(`/api/events?_ts=${Date.now()}`),
        requestJson(`/api/events/governorate-rates?includeInactive=0&_ts=${Date.now()}`),
      ]);
      setTypes(normalizeTypes(typePayload?.types));
      setComponents(Array.isArray(componentPayload?.components) ? componentPayload.components : []);
      setScheduledEvents(Array.isArray(eventPayload?.events) ? eventPayload.events : []);
      setRates(Array.isArray(ratePayload?.rates) ? ratePayload.rates : []);
      setRatesAuthorized(!!ratePayload?.canEdit || accessLevel === "admin");
      notify("success", "Events", "The component catalogue, schedule, and rates were refreshed.");
    } catch (refreshError) {
      notify("error", "Refresh failed", refreshError?.message || "Could not refresh event data.");
    } finally {
      setRefreshing(false);
    }
  }

  function validate() {
    if (!text(form.eventName) || !text(form.organizationName) || !text(form.eventStartDate) || !text(form.venueName) || !text(form.governorate) || !text(form.locationUrl)) {
      return "Complete all required fields before submitting.";
    }
    if (!text(form.eventType)) return "Choose an event type.";
    const start = new Date(form.eventStartDate);
    const end = form.eventEndDate ? new Date(form.eventEndDate) : null;
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) return "Enter valid event date and time values.";
    if (end && end.getTime() < start.getTime()) return "End date and time cannot be before the start date and time.";
    if (!isGoogleMapsUrl(form.locationUrl)) return "Google Maps / Location URL must be a valid Google Maps link.";
    if (!selectedRate) return "Transport cost for the selected governorate or area is not configured.";
    return "";
  }

  function payload() {
    return {
      eventName: text(form.eventName),
      eventType: text(form.eventType),
      eventTypeCustom: types.find((item) => item.code === form.eventType)?.isCustom ? text(types.find((item) => item.code === form.eventType)?.label) : "",
      eventStartDate: toIso(form.eventStartDate),
      eventEndDate: toIso(form.eventEndDate),
      expectedAttendees: number(form.expectedAttendees),
      organizationName: text(form.organizationName),
      contactPerson: text(form.contactPerson),
      contactPhone: text(form.contactPhone),
      contactEmail: text(form.contactEmail),
      audience: text(form.audience),
      projects: projects.map((item) => {
        const component = components.find((entry) => text(entry.id) === text(item.componentId));
        return {
          componentId: text(item.componentId),
          title: text(component?.name),
          quantity: number(item.quantity),
          workingCost: number(item.workingCost),
          description: text(item.description),
        };
      }).filter((item) => item.componentId && item.title),
      marketingMaterials: marketing.map((item) => componentPayload(item)).filter((item) => item.componentId && item.name),
      venueRequirements: venueRequirements.map((item) => componentPayload(item)).filter((item) => item.componentId && item.name),
      venueName: text(form.venueName),
      venueType: text(form.venueType),
      governorate: text(form.governorate),
      locationUrl: text(form.locationUrl),
      venueSetupTime: toIso(form.venueSetupTime),
      requiresPower: !!form.requiresPower,
      requiresInternet: !!form.requiresInternet,
      requiresSoundSystem: !!form.requiresSoundSystem,
      venueNotes: text(form.venueNotes),
    };
  }

  function componentPayload(item) {
    const component = components.find((entry) => text(entry.id) === text(item.componentId));
    const quantity = number(item.quantity);
    const operatingCost = number(component?.operatingCost);
    const rentalCost = lower(component?.ownershipType) === "external_rental" ? number(component?.rentalCost) : 0;
    const unitCost = operatingCost + rentalCost;
    return {
      componentId: text(item.componentId),
      name: text(component?.name),
      quantity,
      notes: text(item.notes),
      ownershipType: text(component?.ownershipType) || "company_owned",
      operatingCost,
      rentalCost,
      unitCost,
      totalCost: unitCost * quantity,
      linkUrl: safeHttpUrl(component?.linkUrl),
      photoUrl: safeHttpUrl(component?.photoUrl),
    };
  }

  async function submit(event) {
    event.preventDefault();
    if (viewOnly) return notify("info", "View access", "Your account can review this form but cannot submit changes.");
    const validationError = validate();
    setError(validationError);
    if (validationError) return;
    setSubmitting(true);
    try {
      await requestJson(editingId ? `/api/events/${encodeURIComponent(editingId)}` : "/api/events", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload()),
      });
      notify("success", "Events", editingId ? "Event request updated successfully." : "Event request submitted successfully.");
      window.setTimeout(() => { window.location.href = "/next/events"; }, 550);
    } catch (submitError) {
      setError(submitError?.message || "Could not save the event request.");
      setSubmitting(false);
    }
  }

  async function openRateEditor() {
    if (viewOnly) return notify("info", "View access", "Your account cannot edit transport rates.");
    if (ratesAuthorized || accessLevel === "admin") {
      try {
        const payloadData = await requestJson(`/api/events/governorate-rates?includeInactive=1&_ts=${Date.now()}`);
        setRatesDraft((Array.isArray(payloadData?.rates) ? payloadData.rates : []).map((rate, index) => ({ ...rate, key: text(rate.id) || makeKey(`rate-${index}`) })));
      } catch {
        setRatesDraft(rates.map((rate, index) => ({ ...rate, key: text(rate.id) || makeKey(`rate-${index}`) })));
      }
      setRatesError("");
      setShowRates(true);
      return;
    }
    setRatePassword("");
    setRateAuthError("");
    setShowRateAuth(true);
  }

  async function authorizeRateEditor(event) {
    event.preventDefault();
    const password = text(ratePassword);
    if (!password) return setRateAuthError("Enter the Events Admin password.");
    setAuthorizingRates(true);
    setRateAuthError("");
    try {
      await requestJson("/api/events/admin/verify", {
        method: "POST",
        body: JSON.stringify({ password, intent: "governorate_rates" }),
      });
      setRatesAuthorized(true);
      setShowRateAuth(false);
      const payloadData = await requestJson(`/api/events/governorate-rates?includeInactive=1&_ts=${Date.now()}`);
      setRatesDraft((Array.isArray(payloadData?.rates) ? payloadData.rates : []).map((rate, index) => ({ ...rate, key: text(rate.id) || makeKey(`rate-${index}`) })));
      setShowRates(true);
    } catch (authError) {
      setRateAuthError(authError?.message || "Invalid Admin password.");
    } finally {
      setAuthorizingRates(false);
    }
  }

  function updateRate(key, patch) {
    setRatesDraft((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  async function saveRates(event) {
    event.preventDefault();
    const cleaned = ratesDraft.map((item, index) => ({
      id: text(item.id),
      areaName: text(item.areaName),
      transportCost: number(item.transportCost),
      isActive: item.isActive !== false,
      sortOrder: index + 1,
    })).filter((item) => item.areaName);
    if (!cleaned.length) return setRatesError("Add at least one governorate or area.");
    const seen = new Set();
    for (const item of cleaned) {
      const key = lower(item.areaName).replace(/\s+/g, " ");
      if (seen.has(key)) return setRatesError(`Duplicate governorate or area: ${item.areaName}.`);
      seen.add(key);
    }
    setSavingRates(true);
    setRatesError("");
    try {
      const response = await requestJson("/api/events/governorate-rates", {
        method: "PATCH",
        body: JSON.stringify({ rates: cleaned }),
      });
      const saved = Array.isArray(response?.rates) ? response.rates : cleaned;
      setRates(saved.filter((item) => item?.isActive !== false));
      setRatesAuthorized(accessLevel === "admin");
      setShowRates(false);
      notify("success", "Transport rates", "Governorate transport rates were updated.");
    } catch (saveError) {
      setRatesError(saveError?.message || "Could not save governorate transport rates.");
    } finally {
      setSavingRates(false);
    }
  }

  return (
    <section className="next-event-form-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <header className="next-event-form-hero">
        <div>
          <span className="next-event-form-kicker">{editingId ? `Editing ${initialEvent?.eventCode || "event request"}` : "Operations event brief"}</span>
          <h2>{editingId ? "Update the approved planning details" : "Create a complete event request before execution starts"}</h2>
          <p>Plan the schedule, project resources, reusable event components, venue requirements, and transport estimate in one structured workflow.</p>
          <div className="next-event-form-hero__actions">
            <a href="/next/events" className="secondary-button">Event Requests</a>
            <a href="/next/events-calendar" className="secondary-button">Calendar</a>
            <a href="/next/event-components" className="secondary-button">Components</a>
            <button type="button" className="secondary-button" onClick={refreshReferenceData} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh catalogues"}</button>
          </div>
        </div>
        <aside>
          <small>Estimated total</small>
          <strong>{money(totalCost)}</strong>
          <span>{projects.length + marketing.length + venueRequirements.length} planned items</span>
          <div><b>{money(transportCost)}</b><small>Round-trip transport</small></div>
        </aside>
      </header>

      {bootstrapWarnings.length ? <div className="next-event-form-warning">Some optional reference data could not be loaded. Refresh the catalogues before submitting if a list looks incomplete.</div> : null}
      {viewOnly ? <div className="next-event-form-warning is-info">Your Event Requests access is View only. You can inspect the form, but submission and catalogue changes are disabled.</div> : null}

      <form className="next-event-form" onSubmit={submit}>
        <FormSection number="1" icon="◫" title="Event Overview" description="Who is requesting the event, and when will it happen?">
          <div className="next-event-form-grid">
            <Field label="Event Name" required wide><input value={form.eventName} onChange={(event) => updateField("eventName", event.target.value)} maxLength={240} placeholder="Example: Green Valley School Tech Day 2026" disabled={viewOnly} /></Field>
            <Field label="Event Type" required>
              <div className="next-event-type-control">
                <select value={form.eventType} onChange={(event) => updateField("eventType", event.target.value)} disabled={viewOnly}>
                  {types.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
                </select>
                {!viewOnly ? <button type="button" onClick={() => setCustomTypeOpen((current) => !current)}>＋ Type</button> : null}
              </div>
            </Field>
            <Field label="Expected Attendees"><input type="number" min="0" step="1" value={form.expectedAttendees} onChange={(event) => updateField("expectedAttendees", event.target.value)} placeholder="0" disabled={viewOnly} /></Field>
            {customTypeOpen ? (
              <div className="next-event-custom-type is-wide">
                <input value={customTypeName} onChange={(event) => setCustomTypeName(event.target.value)} maxLength={80} placeholder="Example: Open Day" />
                <button type="button" onClick={saveCustomType} disabled={savingType}>{savingType ? "Saving…" : "Save type"}</button>
              </div>
            ) : null}
            <Field label="Start Date & Time" required><input type="datetime-local" value={form.eventStartDate} onChange={(event) => updateField("eventStartDate", event.target.value)} disabled={viewOnly} /></Field>
            <Field label="End Date & Time"><input type="datetime-local" value={form.eventEndDate} onChange={(event) => updateField("eventEndDate", event.target.value)} disabled={viewOnly} /></Field>
            {conflicts.length ? (
              <div className="next-event-conflict is-wide">
                <span>i</span><div><strong>Schedule notice</strong><p>{conflicts.length} event{conflicts.length === 1 ? " is" : "s are"} already scheduled across the selected date range: {conflicts.slice(0, 3).map((item) => item.eventCode || item.eventName || "Untitled event").join(", ")}.</p></div>
              </div>
            ) : null}
            <Field label="School / Organization" required wide><input value={form.organizationName} onChange={(event) => updateField("organizationName", event.target.value)} maxLength={240} placeholder="Example: Green Valley International School" disabled={viewOnly} /></Field>
            <Field label="Contact Person"><input value={form.contactPerson} onChange={(event) => updateField("contactPerson", event.target.value)} maxLength={160} placeholder="Full name" disabled={viewOnly} /></Field>
            <Field label="Contact Phone"><input type="tel" value={form.contactPhone} onChange={(event) => updateField("contactPhone", event.target.value)} maxLength={80} placeholder="01xxxxxxxxx" disabled={viewOnly} /></Field>
            <Field label="Contact Email" wide><input type="email" value={form.contactEmail} onChange={(event) => updateField("contactEmail", event.target.value)} maxLength={200} placeholder="name@school.edu.eg" disabled={viewOnly} /></Field>
            <Field label="Target Audience" wide><textarea value={form.audience} onChange={(event) => updateField("audience", event.target.value)} rows={4} maxLength={1000} placeholder="Grades, parents, teachers, and expected audience profile…" disabled={viewOnly} /></Field>
          </div>
        </FormSection>

        <FormSection number="2" icon="⚙" title="Projects" description="Add every activity, kit, or technical project required for the event." action={<button type="button" className="next-event-inline-add" onClick={addProject} disabled={viewOnly}>＋ Add Project</button>}>
          <div className="next-event-repeat-list">
            {!projects.length ? <EmptyRows label="projects" /> : projects.map((item) => {
              const component = components.find((entry) => text(entry.id) === text(item.componentId));
              return (
                <article className="next-event-repeat-row next-event-repeat-row--project" key={item.key}>
                  <Field label="Project / Activity"><select value={item.componentId} onChange={(event) => selectProject(item.key, event.target.value)} disabled={viewOnly}><option value="">Select component</option>{projectComponents.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></Field>
                  <Field label="Quantity"><input type="number" min="0" step="1" value={item.quantity} onChange={(event) => updateProject(item.key, { quantity: event.target.value })} disabled={viewOnly} /></Field>
                  <Field label="Working Cost"><input type="number" min="0" step="0.01" value={item.workingCost} onChange={(event) => updateProject(item.key, { workingCost: event.target.value })} disabled={viewOnly} /></Field>
                  <Field label="Description / Notes" wide><textarea rows={2} value={item.description} onChange={(event) => updateProject(item.key, { description: event.target.value })} maxLength={1500} disabled={viewOnly} /></Field>
                  <div className="next-event-row-meta"><span>{component ? `${money(componentUnitCost(component))} catalogue unit cost` : "Select a project resource"}</span><button type="button" onClick={() => setProjects((current) => current.filter((row) => row.key !== item.key))} disabled={viewOnly}>Remove</button></div>
                </article>
              );
            })}
          </div>
        </FormSection>

        <ComponentSection
          number="3"
          icon="▣"
          title="Marketing Materials"
          description="Select reusable marketing materials and the quantity required."
          kind="marketing"
          rows={marketing}
          source={marketingComponents}
          allComponents={components}
          viewOnly={viewOnly}
          onAdd={() => addComponentRow("marketing")}
          onSelect={(key, value) => selectComponent("marketing", key, value)}
          onUpdate={(key, patch) => updateComponentRow("marketing", key, patch)}
          onRemove={(key) => setMarketing((current) => current.filter((item) => item.key !== key))}
        />

        <ComponentSection
          number="4"
          icon="⌁"
          title="Venue Requirements"
          description="List equipment, setup items, and venue needs required for proper execution."
          kind="venue"
          rows={venueRequirements}
          source={venueComponents}
          allComponents={components}
          viewOnly={viewOnly}
          onAdd={() => addComponentRow("venue")}
          onSelect={(key, value) => selectComponent("venue", key, value)}
          onUpdate={(key, patch) => updateComponentRow("venue", key, patch)}
          onRemove={(key) => setVenueRequirements((current) => current.filter((item) => item.key !== key))}
        />

        <FormSection number="5" icon="⌖" title="Venue & Location Details" description="Give Operations enough detail to prepare the team, transport, and setup.">
          <div className="next-event-form-grid">
            <Field label="Venue Name" required wide><input value={form.venueName} onChange={(event) => updateField("venueName", event.target.value)} maxLength={240} placeholder="Example: Main Sports Hall" disabled={viewOnly} /></Field>
            <Field label="Venue Type"><input value={form.venueType} onChange={(event) => updateField("venueType", event.target.value)} maxLength={120} placeholder="School hall, outdoor area…" disabled={viewOnly} /></Field>
            <Field label="Governorate / Area" required>
              <div className="next-event-governorate-control">
                <select value={form.governorate} onChange={(event) => updateField("governorate", event.target.value)} disabled={viewOnly}>
                  <option value="">Select governorate</option>
                  {rates.filter((rate) => rate?.isActive !== false && text(rate.areaName)).map((rate) => <option value={rate.areaName} key={rate.id || rate.areaName}>{rate.areaName}</option>)}
                </select>
                {!viewOnly ? <button type="button" onClick={openRateEditor}>Edit rates</button> : null}
              </div>
            </Field>
            <Field label="Google Maps / Location URL" required wide><input type="url" value={form.locationUrl} onChange={(event) => updateField("locationUrl", event.target.value)} maxLength={1000} placeholder="https://maps.app.goo.gl/..." disabled={viewOnly} /><small className={form.locationUrl && !isGoogleMapsUrl(form.locationUrl) ? "is-error" : ""}>{form.locationUrl && !isGoogleMapsUrl(form.locationUrl) ? "Paste a valid Google Maps link." : "Use the exact Google Maps venue link."}</small></Field>
            <Field label="Venue Setup Time"><input type="datetime-local" value={form.venueSetupTime} onChange={(event) => updateField("venueSetupTime", event.target.value)} disabled={viewOnly} /></Field>
            <div className="next-event-checkboxes is-wide">
              <label><input type="checkbox" checked={form.requiresPower} onChange={(event) => updateField("requiresPower", event.target.checked)} disabled={viewOnly} /><span>Electricity / power points required</span></label>
              <label><input type="checkbox" checked={form.requiresInternet} onChange={(event) => updateField("requiresInternet", event.target.checked)} disabled={viewOnly} /><span>Internet connection required</span></label>
              <label><input type="checkbox" checked={form.requiresSoundSystem} onChange={(event) => updateField("requiresSoundSystem", event.target.checked)} disabled={viewOnly} /><span>Sound system required</span></label>
            </div>
            <Field label="Venue Notes" wide><textarea value={form.venueNotes} onChange={(event) => updateField("venueNotes", event.target.value)} rows={5} maxLength={3000} placeholder="Access, setup constraints, parking, security, and special instructions…" disabled={viewOnly} /></Field>
          </div>
        </FormSection>

        <section className="next-event-cost-summary" aria-label="Event cost summary">
          <article><small>Working Cost</small><strong>{money(workingCost)}</strong><span>Projects, marketing materials, and venue requirements</span></article>
          <article><small>Transport Cost</small><strong>{money(transportCost)}</strong><span>{selectedRate ? `${money(selectedRate.transportCost)} × 2 · ${selectedRate.areaName}` : "Select a governorate to calculate transport"}</span></article>
          <article className="is-total"><small>Total Cost</small><strong>{money(totalCost)}</strong><span>Working cost + round-trip transport</span></article>
        </section>

        {error ? <div className="next-event-form-error" role="alert">{error}</div> : null}
        <footer className="next-event-form-submit">
          <a href="/next/events" className="secondary-button">Cancel</a>
          <button type="submit" className="primary-button" disabled={submitting || viewOnly}>{submitting ? (editingId ? "Updating…" : "Submitting…") : (editingId ? "Update Event Request" : "Submit Event Request")}</button>
        </footer>
      </form>

      {showRateAuth ? (
        <div className="next-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRateAuth(false); }}>
          <form className="next-modal next-event-auth-modal" onSubmit={authorizeRateEditor}>
            <header><div><span>Admin authorization</span><h2>Transport settings</h2><p>Enter the Events Admin password to edit governorate transport rates.</p></div><button type="button" onClick={() => setShowRateAuth(false)}>×</button></header>
            <Field label="Admin Password" required><input type="password" value={ratePassword} onChange={(event) => setRatePassword(event.target.value)} autoFocus /></Field>
            {rateAuthError ? <div className="next-event-form-error">{rateAuthError}</div> : null}
            <footer><button type="button" className="secondary-button" onClick={() => setShowRateAuth(false)}>Cancel</button><button type="submit" className="primary-button" disabled={authorizingRates}>{authorizingRates ? "Authorizing…" : "Authorize & Continue"}</button></footer>
          </form>
        </div>
      ) : null}

      {showRates ? (
        <div className="next-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRates(false); }}>
          <form className="next-modal next-event-rates-modal" onSubmit={saveRates}>
            <header><div><span>Transport settings</span><h2>Governorate transport rates</h2><p>Set the approximate one-way cost. Event transport is calculated as the selected rate × 2.</p></div><button type="button" onClick={() => setShowRates(false)}>×</button></header>
            <div className="next-event-rates-list">
              {ratesDraft.map((rate) => (
                <article key={rate.key}>
                  <input value={rate.areaName || ""} onChange={(event) => updateRate(rate.key, { areaName: event.target.value })} placeholder="Governorate / Area" maxLength={120} />
                  <input type="number" min="0" step="0.01" value={rate.transportCost ?? 0} onChange={(event) => updateRate(rate.key, { transportCost: event.target.value })} placeholder="Transport Cost" />
                  <label><input type="checkbox" checked={rate.isActive !== false} onChange={(event) => updateRate(rate.key, { isActive: event.target.checked })} /><span>Active</span></label>
                  <button type="button" onClick={() => rate.id ? updateRate(rate.key, { isActive: false }) : setRatesDraft((current) => current.filter((item) => item.key !== rate.key))}>{rate.id ? "Deactivate" : "Remove"}</button>
                </article>
              ))}
            </div>
            <button type="button" className="next-event-add-rate" onClick={() => setRatesDraft((current) => [...current, { key: makeKey("rate"), id: "", areaName: "", transportCost: 0, isActive: true }])}>＋ Add Governorate / Area</button>
            {ratesError ? <div className="next-event-form-error">{ratesError}</div> : null}
            <footer><button type="button" className="secondary-button" onClick={() => setShowRates(false)}>Cancel</button><button type="submit" className="primary-button" disabled={savingRates}>{savingRates ? "Saving…" : "Save Transport Rates"}</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function ComponentSection({ number: sectionNumber, icon, title, description, kind, rows, source, allComponents, viewOnly, onAdd, onSelect, onUpdate, onRemove }) {
  return (
    <FormSection number={sectionNumber} icon={icon} title={title} description={description} action={<button type="button" className="next-event-inline-add" onClick={onAdd} disabled={viewOnly}>＋ Add {kind === "marketing" ? "Material" : "Requirement"}</button>}>
      <div className="next-event-repeat-list">
        {!rows.length ? <EmptyRows label={kind === "marketing" ? "marketing materials" : "venue requirements"} /> : rows.map((item) => {
          const component = allComponents.find((entry) => text(entry.id) === text(item.componentId));
          const cost = componentTotal(component, item.quantity);
          const link = safeHttpUrl(component?.linkUrl);
          return (
            <article className="next-event-repeat-row next-event-repeat-row--component" key={item.key}>
              <Field label="Component"><select value={item.componentId} onChange={(event) => onSelect(item.key, event.target.value)} disabled={viewOnly}><option value="">Select component</option>{source.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></Field>
              <Field label="Quantity"><input type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => onUpdate(item.key, { quantity: event.target.value })} disabled={viewOnly} /></Field>
              <div className="next-event-component-cost"><small>Cost</small><strong>{component ? money(cost) : "Select a component"}</strong><span>{component ? `${money(componentUnitCost(component))} / unit · ${lower(component.ownershipType) === "external_rental" ? "External Rental" : "Company Owned"}` : "Cost details appear here."}</span></div>
              <Field label="Notes" wide><textarea rows={2} value={item.notes} onChange={(event) => onUpdate(item.key, { notes: event.target.value })} maxLength={1000} disabled={viewOnly} /></Field>
              <div className="next-event-row-meta">{link ? <a href={link} target="_blank" rel="noreferrer">Open supplier link ↗</a> : <span>No external link</span>}<button type="button" onClick={() => onRemove(item.key)} disabled={viewOnly}>Remove</button></div>
            </article>
          );
        })}
      </div>
    </FormSection>
  );
}
