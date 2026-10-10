/* Pure date-based analytics shared by the SQL-aggregate and row fallback paths.
 * Each workspace is analyzed separately to avoid double-counting overlapping orders.
 * No completion durations are inferred from creation timestamps. */
const DAY_MS = 24 * 60 * 60 * 1000;

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function createdMs(group) {
  const direct = group?.createdTime ?? group?.created_time;
  const created = direct ? new Date(direct).getTime() : NaN;
  if (Number.isFinite(created)) return created;
  const items = Array.isArray(group?.items) ? group.items : [];
  const dates = items.map((row) => new Date(row?.createdAt ?? row?.createdTime ?? row?.notionCreatedTime ?? row?.notion_created_time ?? "").getTime())
    .filter(Number.isFinite);
  return dates.length ? Math.max(...dates) : null;
}

function startFor(now, duration) {
  const start = new Date(now);
  if (duration === "year") start.setFullYear(start.getFullYear() - 1);
  else if (duration === "month") start.setMonth(start.getMonth() - 1);
  else start.setTime(start.getTime() - (duration === "week" ? 7 : 30) * DAY_MS);
  return start.getTime();
}

function periodStartForComparison(now, duration) {
  const start = startFor(now, duration);
  if (duration === "month") {
    const prior = new Date(start);
    prior.setMonth(prior.getMonth() - 1);
    return prior.getTime();
  }
  if (duration === "year") {
    const prior = new Date(start);
    prior.setFullYear(prior.getFullYear() - 1);
    return prior.getTime();
  }
  return start - (now - start);
}

function formatPoint(ms, duration) {
  return new Intl.DateTimeFormat("en-GB", duration === "year"
    ? { month: "short", year: "2-digit", timeZone: "UTC" }
    : { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(ms));
}

/**
 * @param {Array} groups Unfiltered, permission-scoped order groups for ONE workspace.
 * @param {Array} statusDefinitions Status bucket labels/colors for that workspace.
 * @param {Function} statusOf Returns the same status bucket used by dashboard totals.
 * @param {string} duration The same global filter used by the dashboard.
 * @param {Date} at Optional injected clock for repeatable tests.
 */
export function buildWorkspaceTrend(groups = [], statusDefinitions = [], statusOf = () => "", duration = "all", at = new Date(), followUpStatus = "") {
  const source = Array.isArray(groups) ? groups : [];
  const now = new Date(at).getTime();
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const safeDuration = ["week", "month", "year"].includes(duration) ? duration : "all";
  const from = startFor(safeNow, safeDuration);
  const previousFrom = periodStartForComparison(safeNow, safeDuration);
  const windowSize = safeNow - from;
  const numBins = safeDuration === "week" ? 8 : safeDuration === "year" ? 12 : 10;
  const definitions = statusDefinitions.map((item) => ({ key: item.key, label: item.label, color: item.color }));
  const bins = Array.from({ length: numBins }, (_, i) => ({
    key: i,
    label: formatPoint(from + i * windowSize / numBins, safeDuration),
    shortLabel: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...(safeDuration === "year" ? { month: "short" } : { day: "numeric" }) }).format(new Date(from + i * windowSize / numBins)),
    count: 0,
    parts: definitions.map((item) => ({ ...item, count: 0 })),
  }));
  const current = { count: 0, cost: 0 };
  const previous = { count: 0, cost: 0 };
  const aging = { open: 0, olderThan7Days: 0, undated: 0 };
  let undated = 0;
  let dated = 0;
  let max = 0;

  for (const group of source) {
    const date = createdMs(group);
    const cost = finiteNumber(group?.cost);
    const status = String(statusOf(group) ?? "").toLowerCase();
    const isInFollowUp = followUpStatus
      ? status === followUpStatus
      : status !== "" && !["completed", "delivered", "approved", "rejected"].includes(status);
    // Aging must follow the selected global range and the workspace follow-up bucket.
    const insideGlobalSelection = date === null ? safeDuration === "all" : date <= safeNow && (safeDuration === "all" || date >= from);
    if (isInFollowUp && insideGlobalSelection) {
      aging.open += 1;
      if (date === null) aging.undated += 1;
      else if (safeNow - date >= 7 * DAY_MS) aging.olderThan7Days += 1;
    }
    if (date === null) {
      undated += 1;
      continue;
    }
    dated += 1;
    if (date >= from && date <= safeNow) {
      current.count += 1;
      current.cost += cost;
      const idx = Math.max(0, Math.min(numBins - 1, Math.floor((date - from) / windowSize * numBins)));
      const bin = bins[idx];
      bin.count += 1;
      const part = bin.parts.find((item) => item.key === status);
      if (part) part.count += 1;
      max = Math.max(max, bin.count);
    } else if (date >= previousFrom && date < from) {
      previous.count += 1;
      previous.cost += cost;
    }
  }

  const delta = (currentValue, previousValue) => previousValue === 0 ? null
    : Math.round((currentValue - previousValue) / Math.abs(previousValue) * 100);
  const rangeLabel = safeDuration === "week" ? "Past 7 days" : safeDuration === "year" ? "Past 12 months" : "Past month";
  return {
    duration: safeDuration,
    trendLabel: safeDuration === "all" ? "Past 30 days (all-time filter)" : rangeLabel,
    compareLabel: safeDuration === "all" ? "Last 30 days vs prior 30" : `${rangeLabel} vs previous period`,
    bins,
    max,
    statusDefinitions: definitions,
    current,
    previous,
    countDelta: delta(current.count, previous.count),
    costDelta: delta(current.cost, previous.cost),
    dated,
    undated,
    aging,
  };
}
