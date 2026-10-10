import assert from "node:assert/strict";
import { buildWorkspaceTrend } from "../lib/home-trend-analytics.mjs";

const now = new Date("2026-10-11T12:00:00Z");
const definitions = [
  { key: "pending", label: "Pending", color: "#f97316" },
  { key: "approved", label: "Approved", color: "#168455" },
];
const order = (createdTime, statusBucket = "pending", cost = 100) => ({ createdTime, statusBucket, cost });
const rows = [
  order("2026-10-10T09:00:00Z", "approved", 150),
  order("2026-10-05T09:00:00Z", "pending", 200),
  order("2026-09-20T09:00:00Z", "pending", 300),
  order("2026-09-05T09:00:00Z", "pending", 400),
  order(null, "pending", 700),
];
const result = (duration) => buildWorkspaceTrend(rows, definitions, (group) => group.statusBucket, duration, now, "pending");

const all = result("all");
assert.deepEqual(all.current, { count: 3, cost: 650 });
assert.deepEqual(all.previous, { count: 1, cost: 400 });
assert.equal(all.countDelta, 200);
assert.equal(all.undated, 1);
assert.equal(all.aging.open, 4);
assert.equal(all.aging.olderThan7Days, 2);
assert.equal(all.bins.reduce((sum, bin) => sum + bin.count, 0), all.current.count);

const week = result("week");
assert.equal(week.current.count, 2);
assert.equal(week.previous.count, 0);
assert.equal(week.countDelta, null); // Previous period zero -> no misleading percentage
assert.equal(week.aging.olderThan7Days, 0);
assert.equal(week.bins.length, 8);

const month = result("month");
assert.equal(month.current.count, 3);
assert.equal(month.previous.count, 1);
assert.equal(month.bins.reduce((sum, bin) => sum + bin.count, 0), 3);

const year = result("year");
assert.equal(year.current.count, 4);
assert.equal(year.bins.length, 12);
assert.equal(year.bins.reduce((sum, bin) => sum + bin.count, 0), 4);

const noDates = buildWorkspaceTrend([order(null)], definitions, (group) => group.statusBucket, "all", now);
assert.equal(noDates.current.count, 0);
assert.equal(noDates.undated, 1);
assert.equal(noDates.aging.undated, 1);

console.log("Home trends: all 5 analytics checks passed");
