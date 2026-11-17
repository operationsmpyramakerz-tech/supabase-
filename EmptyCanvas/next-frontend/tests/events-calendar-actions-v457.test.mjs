import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const calendar = read('components/events/EventsCalendarClient.jsx');
const details = read('components/events/EventsDialogs.jsx');
const css = read('public/css/events.css');
test('row and three-dot trigger are separate interactive controls', () => {
  assert.match(calendar, /<article key=\{event.id\} className=\{`agenda-row[\s\S]*?<button type="button" className="agenda-row-open" onClick=\{\(\) => openEventDetails\(event\)\}[\s\S]*?<\/button><EventCardActions/);
  assert.match(calendar, /className="agenda-row-more"[\s\S]*?onClick=\{onToggle\}/);
  assert.match(calendar, /createPortal\(<div ref=\{menuRef\}/);
  assert.match(calendar, /!triggerRef.current\?\.contains\(e.target\) && !menuRef.current\?\.contains\(e.target\)/);
});
test('edit, PDF and archive are card actions with existing permission gates', () => {
  assert.match(calendar, /canEdit && !event.isArchived \? \[\{ key: "edit"/);
  assert.match(calendar, /canExport \? \[\{ key: "pdf"/);
  assert.match(calendar, /canArchive && !event.isArchived \? \[\{ key: "archive"/);
  assert.match(calendar, /canArchiveRequests && canOpenRequests && featureAllowed\(account, "events.requests.archive"\)/);
  assert.match(calendar, /archive-event", eventId: confirmation.eventId/);
  assert.match(calendar, /isArchived: body.event.isArchived/);
  assert.match(read('app/events-calendar/page.jsx'), /canArchiveRequests=\{hasEventRequestsAdminAccess\(pageData.account\)\}/);
  assert.match(read('app/api/events/mutations-direct/route.js'), /hasEventRequestsAdminAccess\(gate.account[\s\S]*?assertEventRequestScope\(gate.account, "events.requests.archive"/);
});
test('Calendar detail removes header actions but retains them in legacy request details', () => {
  assert.match(details, /\{!calendarMode && <div className="event-detail-actions">/);
  assert.match(details, /\{!calendarMode && <button type="button" className="event-detail-close"/);
  assert.match(details, /calendarMode && <footer className="event-detail-sheet-footer">/);
  assert.match(details, /className="event-detail-sheet-close" disabled=\{busy\} onClick=\{onClose\}/);
});
test('Update uses existing permitted status transitions and archive is read-only', () => {
  assert.match(details, /const canConfirmStatus = calendarMode && Boolean\(showWorkflow\)/);
  assert.match(details, /const canCancelStatus = calendarMode && full && canCancel && !event.isArchived && confirmation !== "cancelled"/);
  assert.match(details, /canConfirmStatus && <button[\s\S]*?onConfirmEvent\(\)/);
  assert.match(details, /canCancelStatus && <button[\s\S]*?onRequestAction\("cancel"\)/);
  assert.match(calendar, /activeEvent.isArchived \|\| eventConfirmation\(activeEvent.status\) !== "pending"/);
  assert.match(calendar, /targetStatus: "in_progress"/);
  assert.match(calendar, /requestAction: "cancel"/);
});
test('sheet uses visual viewport height and a non-scrolling footer', () => {
  assert.match(details, /window.visualViewport/);
  assert.match(details, /"--event-sheet-height"/);
  assert.match(css, /height: var\(--event-sheet-height, 100dvh\) !important/);
  assert.match(css, /\.event-detail-v2--sheet > \.event-detail-body \{[\s\S]*?overflow: auto;/);
  assert.match(css, /\.event-detail-v2--sheet \.event-detail-sheet-footer \{[\s\S]*?flex: 0 0 auto/);
  assert.match(css, /max\(24px,env\(safe-area-inset-bottom,0px\)\)/);
});
