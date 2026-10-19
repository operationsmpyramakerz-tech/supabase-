import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");
const importPlain = async path => import(`data:text/javascript;base64,${Buffer.from(source(path)).toString("base64")}`);
const { featureAllowed, ACTIVE_PILOT_FEATURE_KEYS } = await importPlain("../lib/feature-permissions-registry.js");
const { matchEventPageAccess } = await importPlain("../lib/events-page-match.js");
const { eventCalendarList, eventCalendarSummary } = await importPlain("../lib/events-read-policy.js");
const enforced = grants => ({ featureAccess: { mode: "enforced", grants } });
const grant = allowed => ({ allowed, scope: "all" });

test("Calendar View is opt-in; enrolled Request and Calendar modules are independent", () => {
  const legacyPilot = enforced({ "events.requests.view": grant(false) });
  assert.equal(featureAllowed(legacyPilot, "events.calendar.view"), true);
  const account = enforced({ "events.requests.view": grant(false), "events.calendar.view": grant(true) });
  assert.equal(featureAllowed(account, "events.calendar.view"), true);
  assert.equal(featureAllowed(account, "events.requests.view"), false);
  assert.equal(featureAllowed(enforced({ "events.calendar.view": grant(false) }), "events.calendar.view"), false);
  assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes("events.calendar.view"));
  assert.match(source("../components/users-center/UsersCenterDialogs.jsx"), /"events.calendar": stored.some/);
});

test("A Calendar page does not satisfy an Event Requests or Event Components page gate", () => {
  const calendar = {pageName: "Event Calendar", pageKey: "event-calendar", routePath: "/events/calendar", aliases: ["Event Calendar"]};
  assert.equal(matchEventPageAccess(calendar, "Event Calendar"), true);
  assert.equal(matchEventPageAccess(calendar, "Event Requests"), false);
  assert.equal(matchEventPageAccess(calendar, "Event Components"), false);
  assert.equal(matchEventPageAccess({ pageName: "Event Requests" }, "Event Calendar"), false);
  assert.equal(matchEventPageAccess({ pageName: "Event Requests", routePath: "/events", aliases: ["Event Requests", "/events"] }, "Event Calendar"), false);
  assert.equal(matchEventPageAccess({ pageName: "Events" }, "Event Requests"), true); // old broad page rule
  assert.equal(matchEventPageAccess({}, "Orders"), null);
  assert.ok(source("../lib/direct-session-account.js").includes('if (exactEventMatch !== null) return exactEventMatch;'));
});

test("Calendar event projection drops request-only contact, costs, and notes", () => {
  const original = { id: "x", eventCode: "EV-1", eventName: "Demo", eventStartDate: "2026-11-01", governorate: "Cairo", contactPhone: "secret", contactEmail: "secret@example.com", totalCost: 9000, projects: [{ name: "Confidential" }], requesterName: "Private", notes: "Private note" };
  const limited = eventCalendarSummary(original);
  assert.equal(limited.eventName, "Demo");
  assert.equal(limited.eventStartDate, "2026-11-01");
  assert.equal(Object.hasOwn(limited,"contactPhone"), false);
  assert.equal(Object.hasOwn(limited,"contactEmail"), false);
  assert.equal(Object.hasOwn(limited,"totalCost"), false);
  assert.equal(Object.hasOwn(limited,"projects"), false);
  assert.equal(Object.hasOwn(limited,"requesterName"), false);
  assert.deepEqual(eventCalendarList([original]), [limited]);
});

test("Event list/detail APIs require the named page; calendar responses are projected", () => {
  for (const path of ["../app/api/events/route.js", "../app/api/events/[id]/route.js"]) {
    const route = source(path);
    assert.ok(route.includes('url.searchParams.get("view") === "calendar"') || route.includes('searchParams.get("view") === "calendar"'));
    assert.ok(route.includes('calendar ? "Event Calendar" : "Event Requests"'));
    assert.ok(route.includes('getDirectAccountGate([requiredPage])'));
    assert.ok(route.includes('calendar ? "events.calendar.view" : "events.requests.view"'));
    assert.ok(route.includes('calendar ? eventCalendar'));
  }
  assert.ok(source("../lib/events-data.js").includes('events: mode === "calendar" ? eventCalendarList(events) : events'));
  assert.ok(source("../components/events/EventsCalendarClient.jsx").includes('"view=calendar&"'));
  const pdf = source("../app/api/events/pdf-direct/route.js");
  assert.ok(pdf.includes('getDirectAccountGate(["Event Requests"])'));
  assert.ok(pdf.includes('"events.requests.pdf"'));
});

test("Admin token issuance checks the view and action grants BEFORE password verification", () => {
  const route = source("../app/api/events/admin/verify/route.js");
  assert.ok(route.includes('const guarded = featureGate(gate, key)'));
  for (const key of ['events.components.create','events.components.edit','events.requests.edit','events.requests.cancel','events.requests.workflow','events.requests.governorate_rates']) assert.ok(route.includes(`"${key}"`));
  assert.ok(route.indexOf('const guarded = featureGate(gate, key)') < route.indexOf('verifySharedAdminPasswordDirect(password)'));
  assert.ok(route.indexOf('const guarded = featureGate(gate, key)') < route.indexOf('issueEventsAuthorizationToken(gate.account'));
});

test("Event Team list does not disclose full Event Requests data", () => {
  assert.ok(source("../app/api/events/team/route.js").includes('events: eventCalendarList(events)'));
  assert.ok(source("../components/events/EventsCalendarClient.jsx").includes('const canExport = canOpenRequests &&'));
});
