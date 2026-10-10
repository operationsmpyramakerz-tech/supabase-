/**
 * Snapshot backlog analysis. These numbers measure the age of orders that are
 * STILL in an open status, using creation time. They are NOT cycle times or
 * completion durations. Pure and shared by the RPC and row fallback loaders.
 */
const DAY_MS = 86_400_000;

function dateFrom(group) {
  const raw = group?.createdTime ?? group?.created_time;
  if (raw) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  const rows = Array.isArray(group?.items) ? group.items : [];
  const dates = rows.map((row) => {
    const value = row?.createdTime ?? row?.createdAt ?? row?.notionCreatedTime ?? row?.notion_created_time;
    return value ? Date.parse(value) : NaN;
  }).filter(Number.isFinite);
  return dates.length ? Math.max(...dates) : null;
}

function startFor(now, duration) {
  const start = new Date(now);
  if (duration === "year") start.setFullYear(start.getFullYear() - 1);
  else if (duration === "month") start.setMonth(start.getMonth() - 1);
  else start.setTime(start.getTime() - 7 * DAY_MS);
  return start.getTime();
}

function labelFor(group) {
  const raw = group?.orderNumber ?? group?.order_number
    ?? group?.items?.[0]?.orderIdNumber ?? group?.items?.[0]?.order_number;
  const num = Number(raw);
  return raw !== null && raw !== undefined && raw !== "" && Number.isSafeInteger(num) && num > 0 ? `Order #${num}` : "Order (number unavailable)";
}

export const BACKLOG_AGE_BANDS = [
  { key: "0-2", label: "0–2 days", color: "#16a085" },
  { key: "3-6", label: "3–6 days", color: "#56a8bf" },
  { key: "7-13", label: "7–13 days", color: "#ef9b3d" },
  { key: "14-29", label: "14–29 days", color: "#dc7339" },
  { key: "30+", label: "30+ days", color: "#ce454b" },
];

/** One workspace only; never combine overlapping order workspaces. */
export function buildWorkspaceBacklog(groups = [], {
  statusOf = (group) => group?.statusBucket,
  openStatuses = [],
  duration = "all",
  at = new Date(),
  oldestLimit = 4,
} = {}) {
  const clock = new Date(at).getTime();
  const now = Number.isFinite(clock) ? clock : Date.now();
  const from = ["week", "month", "year"].includes(duration) ? startFor(now, duration) : null;
  const eligible = new Set(openStatuses.map((status) => String(status).toLowerCase()));
  const bands = BACKLOG_AGE_BANDS.map((item) => ({ ...item, count: 0 }));
  const ages = [];
  const oldest = [];
  let open = 0;
  let unknownDate = 0;

  for (const group of Array.isArray(groups) ? groups : []) {
    if (!eligible.has(String(statusOf(group) ?? "").toLowerCase())) continue;
    const date = dateFrom(group);
    if (date !== null && date > now) continue;
    // Scoped to creation-date filter just like the Home summary cards.
    if (from !== null && (date === null || date < from)) continue;
    open += 1;
    if (date === null) { unknownDate += 1; continue; }
    const days = Math.floor((now - date) / DAY_MS);
    ages.push(days);
    const index = days < 3 ? 0 : days < 7 ? 1 : days < 14 ? 2 : days < 30 ? 3 : 4;
    bands[index].count += 1;
    oldest.push({ key: String(group?.key || `${labelFor(group)}-${date}`), label: labelFor(group), ageDays: days, createdTime: new Date(date).toISOString() });
  }
  ages.sort((a, b) => a - b);
  oldest.sort((a, b) => b.ageDays - a.ageDays || a.key.localeCompare(b.key));
  const median = ages.length ? (ages.length % 2
    ? ages[(ages.length - 1) / 2]
    : (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2) : null;
  const average = ages.length ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length * 10) / 10 : null;
  return {
    open,
    dated: ages.length,
    unknownDate,
    medianAgeDays: median,
    averageAgeDays: average,
    sevenPlus: bands.slice(2).reduce((sum, band) => sum + band.count, 0),
    fourteenPlus: bands.slice(3).reduce((sum, band) => sum + band.count, 0),
    bands,
    oldest: oldest.slice(0, Math.max(0, Math.min(8, Math.floor(Number(oldestLimit) || 0)))),
  };
}
