import { eventConfirmation } from "./event-confirmation.mjs";

export function localDay(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const raw = String(value ?? "").trim();
  const dateOnly = raw.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const parsed = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function startOfDay(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function startOfWeek(value = new Date()) {
  const first = startOfDay(value);
  first.setDate(first.getDate() - (first.getDay() + 6) % 7);
  return first;
}

export function dateKey(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function sameDay(first, second) {
  return Boolean(first && second && dateKey(first) === dateKey(second));
}

export function startDate(event) {
  return localDay(event?.eventStartDate);
}

export function endDate(event) {
  return localDay(event?.eventEndDate) || startDate(event);
}

export function eventOnDate(event, day) {
  const start = startDate(event);
  const end = endDate(event);
  if (!start || !end) return false;
  const time = startOfDay(day).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

// Use the same visibility rules for the calendar dots and next-week hint.
export function isScheduledEvent(event) {
  return Boolean(event && !event.isArchived && eventConfirmation(event.status) !== "cancelled");
}

// The hint refers only to the week immediately following the displayed week.
// Calendar-day arithmetic (not millisecond offsets) also handles DST changes.
export function hasEventsNextWeek(week, events) {
  const nextStart = startOfWeek(week);
  nextStart.setDate(nextStart.getDate() + 7);
  const nextEnd = new Date(nextStart);
  nextEnd.setDate(nextEnd.getDate() + 6);
  return events.some(event => {
    if (!isScheduledEvent(event)) return false;
    const start = startDate(event);
    const end = endDate(event);
    return Boolean(start && end && start <= end && start <= nextEnd && end >= nextStart);
  });
}
