import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventConfirmation } from "../lib/event-confirmation.mjs";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const calendar = read("components/events/EventsCalendarClient.jsx");
const dock = read("components/events/EventsAddDock.jsx");
const css = read("public/css/events-add-dock-v1.css");
const form = read("components/events/EventRequestFormClient.jsx");
const page = read("app/events/new/page.jsx");
const route = read("app/api/events/mutations-direct/route.js");
const data = read("lib/events-data.js");

test("the calendar-only add dock preserves creation permission and the selected date", () => {
  assert.match(calendar, /canCreate \? <EventsAddDock onCreate=\{openNewEvent\} canConfirm=\{canConfirm\}/);
  assert.match(calendar, /new URLSearchParams\(\{ startDate: selectedKey, creationStatus \}\)/);
  assert.match(calendar, /!canCreate \|\| \(creationStatus === "confirmed" && !canConfirm\)/);
  assert.match(dock, /mobile-dock-home-rail/);
  assert.match(dock, /mobile-dock-pages-clip/);
  assert.match(dock, /return createPortal\(/);
  assert.match(dock, /disabled=\{!canConfirm\}/);
  assert.match(dock, /choose\("confirmed"\)/);
  assert.match(dock, /choose\("pending"\)/);
  assert.match(read("app/events-calendar/page.jsx"), /events-add-dock-v1.css/);
});
test("mobile dock follows approved task layout and motion", () => {
  assert.match(css, /--events-add-dock-side-w: var\(--mobile-home-block-w/);
  assert.match(css, /grid-template-columns: var\(--events-add-dock-side-w\) minmax\(0, 1fr\) var\(--events-add-dock-side-w\)/);
  assert.match(css, /filter: blur\(3.5px\)/);
  assert.match(css, /border-radius: 50% !important/);
  assert.match(css, /rotate\(45deg\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /events-add-menu::(?:after|before)/);
  assert.match(dock, /inert=\{!open\}/);
});
test("the selected creation type reaches the wizard and create request, not edits", () => {
  assert.match(page, /!editId && resolvedSearch\?\.creationStatus === "confirmed"/);
  assert.match(page, /creationStatus=\{creationStatus\}/);
  assert.match(form, /!editingId && creationStatus === "confirmed"/);
  assert.match(form, /creationStatus: createConfirmed \? "confirmed" : "pending"/);
  assert.match(form, /createConfirmed \? \{ confirmationPassword \} : \{\}/);
  assert.match(form, /Create Confirmed Event/);
});
test("confirmed insert cannot bypass the existing workflow permission, scope, or shared password", () => {
  const create = route.slice(route.indexOf('if (action === "create-event")'),route.indexOf('if (action === "update-event")'));
  const write = create.indexOf("await createEventRequest(");
  assert.ok(write > 0);
  for (const required of ['featureGate(gate, "events.requests.workflow")','eventRequestScopeFor(gate.account, "events.requests.workflow")','await verifySharedAdminPasswordDirect(password)','if (!verified) return json']) {
    assert.ok(create.indexOf(required) >= 0 && create.indexOf(required) < write, required);
  }
  assert.match(create, /creationStatus = body\?\.creationStatus \?\? "pending"/);
  assert.match(create, /creationStatus === "confirmed" \? "in_progress" : "submitted"/);
  assert.match(data, /writeRow.status = initialStatus === "in_progress" \? "in_progress" : "submitted"/);
  assert.equal(eventConfirmation("submitted"), "pending");
  assert.equal(eventConfirmation("in_progress"), "confirmed");
  assert.match(data, /patch.status = normalizeStatus\(existing\?\.status\)/);
});
