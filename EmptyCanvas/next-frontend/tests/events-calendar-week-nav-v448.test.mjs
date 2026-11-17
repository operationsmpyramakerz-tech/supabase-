import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasEventsNextWeek, startOfWeek, localDay, eventOnDate, isScheduledEvent } from '../lib/event-calendar-dates.mjs';

const week = startOfWeek(localDay('2026-11-17'));
const event = (start, end = null, fields = {}) => ({ eventStartDate: start, eventEndDate: end, status: 'submitted', ...fields });
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('hint includes Monday and Sunday of the next displayed week', () => {
  for (const date of ['2026-11-23','2026-11-24','2026-11-29']) assert.equal(hasEventsNextWeek(week, [event(date)]), true);
});
test('hint ignores current week, later weeks and empty calendars', () => {
  for (const date of ['2026-11-16','2026-11-22','2026-11-30','2026-12-01']) assert.equal(hasEventsNextWeek(week, [event(date)]), false);
  assert.equal(hasEventsNextWeek(week, []), false);
});
test('multi-day events overlapping the next week are included', () => {
  for (const dates of [['2026-11-21','2026-11-23'],['2026-11-29','2026-12-02'],['2026-11-10','2026-12-02']]) {
    assert.equal(hasEventsNextWeek(week, [event(...dates)]), true);
  }
  assert.equal(hasEventsNextWeek(week,[event('2026-11-21','2026-11-22')]),false);
});
test('archived and cancelled events do not trigger the hint; pending and confirmed events do', () => {
  for (const fields of [{isArchived:true},{status:'cancelled'}]) {
    const item = event('2026-11-24',null,fields);
    assert.equal(isScheduledEvent(item),false);
    assert.equal(hasEventsNextWeek(week,[item]),false);
  }
  for (const status of ['submitted','approved','confirmed','in_progress']) assert.equal(hasEventsNextWeek(week,[event('2026-11-24',null,{status})]),true);
});
test('navigation recalculates for the newly displayed week, including year boundaries', () => {
  const items = [event('2026-11-24')];
  assert.equal(hasEventsNextWeek(week,items),true);
  assert.equal(hasEventsNextWeek(localDay('2026-11-24'),items),false);
  assert.equal(hasEventsNextWeek(localDay('2026-12-27'),[event('2027-01-01')]),true);
});
test('date matching remains consistent with existing calendar dots', () => {
  const item = event('2026-11-24T08:00:00Z','2026-11-26T17:00:00Z');
  assert.equal(eventOnDate(item,localDay('2026-11-24')),true);
  assert.equal(eventOnDate(item,localDay('2026-11-27')),false);
  assert.equal(hasEventsNextWeek(week,[item]),true);
  assert.equal(hasEventsNextWeek(week,[event('invalid'),event(null),event('2026-11-27','2026-11-24')]),false);
});
test('arrows remain wired to previous and next week and only next receives event hint', () => {
  const source = read('components/events/EventsCalendarClient.jsx');
  assert.match(source,/hasEventsNextWeek\(week, scheduled\), \[week, scheduled\]/);
  assert.match(source,/className="agenda-week-nav" aria-label="Previous week" onClick=\{\(\) => shiftWeek\(-1\)\}/);
  assert.match(source,/nextWeekHasEvents \? " has-next-week-events" : ""/);
  assert.match(source,/onClick=\{\(\) => shiftWeek\(1\)\}/);
});
test('scoped arrow styles reset button padding and respect reduced motion', () => {
  const css = read('public/css/events.css');
  assert.match(css,/\.agenda-month > \.agenda-week-nav \{[^}]*padding: 0 !important;/s);
  assert.match(css,/\.agenda-week-nav\.has-next-week-events > svg \{\s*animation: agenda-next-week-nudge-v448/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\) \{[^}]*animation: none;/s);
  assert.match(read('app/events-calendar/page.jsx'),/events\.css\?v=agenda-toolbar-v456/);
});
