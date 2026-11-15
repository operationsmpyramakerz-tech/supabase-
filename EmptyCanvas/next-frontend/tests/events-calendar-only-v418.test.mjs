import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Events sidebar has no Event Requests destination, while retaining Calendar, Components and Team', () => {
  const flyout = read('components/events/EventsSidebarFlyout.jsx');
  assert.doesNotMatch(flyout, /key:\s*"requests"/);
  for (const page of ['calendar', 'components', 'team']) assert.match(flyout, new RegExp(`key: "${page}"`));
  assert.match(flyout, /values\.has\("event requests"\)/); // legacy team access stays compatible
});

test('retired Event Requests page redirects to Calendar and preserves event deep links', () => {
  const route = read('app/events/page.jsx');
  assert.match(route, /redirect\(eventId\s*\?\s*`\/events-calendar\?event=/);
  assert.doesNotMatch(route, /<EventsClient/);
  assert.match(read('components/events/EventsCalendarClient.jsx'), /new URLSearchParams\(window\.location\.search\)\.get\("event"\)/);
});

test('Event creation and editing still use the existing guarded event wizard, returning to Calendar', () => {
  const wizard = read('components/events/EventRequestFormClient.jsx');
  const page = read('app/events/new/page.jsx');
  assert.match(page, /mode: "new", editId/);
  assert.match(wizard, /navigateWithinApp\("\/next\/events-calendar"\)/);
  assert.doesNotMatch(wizard, /href="\/next\/events"/);
  assert.match(read('components/events/EventsCalendarClient.jsx'), /navigateWithinApp\(`\/next\/events\/new\?/);
});

test('Calendar detail replaces Open Event Request with guarded Edit/Cancel using existing admin tokens', () => {
  const details = read('components/events/EventsDialogs.jsx');
  const calendar = read('components/events/EventsCalendarClient.jsx');
  assert.doesNotMatch(details, /Open Event Request/);
  assert.match(details, /calendarMode && canEdit/);
  assert.match(details, /calendarMode && canCancel/);
  assert.match(calendar, /intent: "request_action", action, eventId:/);
  assert.match(calendar, /sessionStorage\.setItem\(`erp\.events\.editAuth/);
  assert.match(calendar, /requestAction: "cancel"/);
  assert.match(calendar, /canMutateRequests && canOpenRequests && featureAllowed\(account, "events\.requests\.edit"\)/);
});

test('Existing permissions and server-side event security guards remain unchanged', () => {
  for (const path of ['app/api/events/mutations-direct/route.js','app/api/events/admin/verify/route.js']) {
    const source = read(path);
    assert.match(source, /Event Requests/);
    assert.match(source, /featureGate\(/);
  }
  assert.match(read('lib/events-data.js'), /await assertEventRequestScope\(/);
});
