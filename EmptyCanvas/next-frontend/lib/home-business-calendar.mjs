/** Pure working-time arithmetic. No guessed holidays, pauses or overtime. */
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const formatterCache = new Map();

function partsAt(utcMs, zone) {
  let formatter = formatterCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    formatterCache.set(zone, formatter);
  }
  const p = Object.fromEntries(formatter.formatToParts(new Date(utcMs))
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute };
}

const pad = n => String(n).padStart(2, '0');
const tag = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const toMinutes = value => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return NaN;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
};

export function normalizeBusinessCalendar(raw) {
  if (!raw || raw.enabled !== true) return null;
  const zone = String(raw.timezone || '').trim();
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }); } catch { return null; }
  const days = raw.work_days;
  if (!Array.isArray(days) || !days.length || days.length > 7 ||
      days.some(x => !Number.isInteger(Number(x)) || Number(x) < 0 || Number(x) > 6)) return null;
  const start = toMinutes(raw.work_start);
  const end = toMinutes(raw.work_end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const holidays = Array.isArray(raw.holidays) ? raw.holidays : [];
  if (holidays.length > 500 || holidays.some(x => !/^\d{4}-\d{2}-\d{2}$/.test(x))) return null;
  return { zone, days: new Set(days.map(Number)), start, end, holidays: new Set(holidays), windows: new Map() };
}

function localToUtc(year, month, day, minutes, zone) {
  const guess = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  let candidate = guess;
  for (let i = 0; i < 4; i++) {
    const p = partsAt(candidate, zone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const error = guess - represented;
    if (!error) break;
    candidate += error;
  }
  return candidate;
}

/** Returns verified business hours, or null if calendar/range cannot be evaluated. */
export function businessHoursBetween(startMs, endMs, calendar) {
  if (!calendar || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  if (endMs === startMs) return 0;
  const from = partsAt(startMs, calendar.zone);
  const to = partsAt(endMs, calendar.zone);
  const firstDay = Date.UTC(from.year, from.month - 1, from.day);
  const lastDay = Date.UTC(to.year, to.month - 1, to.day);
  const count = Math.round((lastDay - firstDay) / DAY_MS);
  // Prevent unbounded computation from corrupted or extremely old audit events.
  if (count < 0 || count > 3660) return null;
  let total = 0;
  for (let i = 0; i <= count; i++) {
    const dayMs = firstDay + i * DAY_MS;
    const day = new Date(dayMs);
    if (!calendar.days.has(day.getUTCDay())) continue;
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    if (calendar.holidays.has(tag(y, m, d))) continue;
    let window = calendar.windows?.get(dayMs);
    if (!window) {
      window = [localToUtc(y, m, d, calendar.start, calendar.zone), localToUtc(y, m, d, calendar.end, calendar.zone)];
      calendar.windows?.set(dayMs, window);
    }
    const [open, close] = window;
    total += Math.max(0, Math.min(close, endMs) - Math.max(open, startMs));
  }
  return total / HOUR_MS;
}
