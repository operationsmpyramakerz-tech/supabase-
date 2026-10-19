// Keep subpage names distinct when checking page access. The general "Events"
// legacy row intentionally grants the whole family, but a Calendar row must
// never satisfy an Event Requests gate via a shared alias.
function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const EXACT_EVENT_PAGE_ALIASES = Object.freeze({
  eventrequests: ["eventrequests", "eventsrequests", "eventsnew", "eventsrequestsnew", "eventsrequestscreate"],
  eventcalendar: ["eventcalendar", "eventscalendar"],
  eventcomponents: ["eventcomponents"],
  eventteam: ["eventteam"],
});

// Returns null for other pages so existing application aliases are unchanged.
export function matchEventPageAccess(row = {}, page = "") {
  const aliases = EXACT_EVENT_PAGE_ALIASES[normalize(page)];
  if (!aliases) return null;
  // A request row may use /events as its URL; that does *not* make it a
  // generic Events role. Only an explicitly generic page name/key is broad.
  if ([row.pageName, row.pageKey].some(value => normalize(value) === "events")) return true;
  const allowed = new Set(aliases);
  return [row.pageName, row.pageKey, row.routePath, ...(Array.isArray(row.aliases) ? row.aliases : [])]
    .map(normalize).some(candidate => allowed.has(candidate));
}
