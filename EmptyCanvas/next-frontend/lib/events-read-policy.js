// Minimal calendar/team event projection: hide request-only contact, pricing,
// notes and attendee details from users granted only calendar/team access.
// This module intentionally has no server dependencies and can be regression tested.
const CALENDAR_FIELDS = Object.freeze([
  "id", "eventCode", "eventName", "eventType", "eventTypeCustom",
  "status", "eventStartDate", "eventEndDate", "organizationName",
  "governorate", "isArchived",
]);

export function eventCalendarSummary(event) {
  const result = {};
  for (const field of CALENDAR_FIELDS) {
    if (Object.hasOwn(event || {}, field)) result[field] = event[field];
  }
  return result;
}

export function eventCalendarList(events) {
  return (Array.isArray(events) ? events : []).map(eventCalendarSummary);
}
