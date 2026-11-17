import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load = p => readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const jsx = load('components/events/EventsDialogs.jsx');
const css = load('public/css/events.css').split('/* V458')[1];
const icons = load('components/events/EventIcon.jsx');
test('floating badge belongs to the sheet rather than the scroll body and title is centered',()=>{
  assert.match(jsx,/calendarMode && <span className="event-detail-floating-icon"[\s\S]*?<div className="event-detail-body">\s*\{calendarMode && <h2 className="event-detail-sheet-title">Event Details/);
  assert.match(css,/overflow: visible !important/);
  assert.match(css,/top: -26px !important; left: 0 !important; right: 0 !important;\s*width: 52px; height: 52px; margin: 0 auto !important/);
  assert.match(css,/transform: none !important; animation: none !important/);
  assert.match(css,/\.event-detail-sheet-title \{[\s\S]*?text-align: center/);
});
test('solid hero includes actual confirmation label and independent status styles',()=>{
  assert.match(jsx,/const statusLabel = eventConfirmationLabel\(event.status\)/);
  assert.match(jsx,/event-detail-hero-status[\s\S]*?event-detail-status--\$\{confirmation\}[\s\S]*?\{statusLabel\}/);
  assert.match(css,/\.event-detail-hero \{[\s\S]*?background: #111111/);
  assert.match(css,/\.event-detail-hero::after \{display: none;\}/);
  assert.match(css,/\.event-detail-hero-status \{[\s\S]*?border-left:/);
  assert.match(css,/event-detail-status--pending/);
  assert.match(css,/event-detail-status--cancelled/);
});
test('summary and fields are compact and accessible without removing restricted details gates',()=>{
  assert.match(css,/\.event-detail-summary \{\s*display: flex; flex-wrap: nowrap/);
  assert.match(css,/\.event-detail-summary-item \{\s*flex: 1 1 0; display: flex; flex-direction: column/);
  assert.match(jsx,/full && <DetailPanel title="Contact Information"/);
  assert.match(jsx,/label="Utilities" icon=\{calendarMode \? "zap" : undefined\} wide=\{calendarMode\} highlight=\{calendarMode\}/);
  assert.match(jsx,/label="Phone" icon=\{calendarMode \? "phone" : undefined\}/);
  for(const icon of ['phone','mail','building','zap','"refresh-cw"'])assert.match(icons,new RegExp(`\\n    ${icon}:`));
  assert.match(jsx,/calendarMode && item.id === "marketing" \? "Media" : item.label/);
  assert.match(jsx,/tab === "marketing"[\s\S]*?Marketing Materials/);
});
test('Update precedes Close, with existing transition guards and a safe fixed footer',()=>{
  assert.match(jsx,/className="event-detail-sheet-buttons">\s*\{\(canConfirmStatus \|\| canCancelStatus\) && <button[\s\S]*?Update<\/button>\}\s*<button type="button" className="event-detail-sheet-close"/);
  assert.match(css,/\.event-detail-sheet-buttons \{\s*direction: ltr/);
  assert.match(css,/\.event-detail-sheet-buttons > \.event-detail-sheet-update \{\s*background: #ed5b00 !important/);
  assert.match(css,/\.event-detail-sheet-buttons > \.event-detail-sheet-close \{\s*background: var\(--ed-soft\)/);
  assert.match(css,/padding: 8px 12px max\(28px,calc\(env\(safe-area-inset-bottom,0px\) \+ 12px\)\)/);
  assert.match(jsx,/canCancelStatus = calendarMode && full && canCancel && !event.isArchived/);
});
test('dark variables override the same sheet selector and versioned CSS is refreshed',()=>{
  assert.match(css,/:is\(html\[data-theme="dark"\],body.dark-mode,body\[data-theme="dark"\]\) \.events-modal-overlay\.event-detail-overlay\.event-detail-overlay--sheet > \.events-modal\.event-detail-v2--sheet \{/);
  assert.match(load('app/events-calendar/page.jsx'),/events\.css\?v=agenda-details-v458/);
});
