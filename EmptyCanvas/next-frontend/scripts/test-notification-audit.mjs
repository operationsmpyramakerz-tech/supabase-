/** Notification audit smoke tests. Run: node scripts/test-notification-audit.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modernNotificationUrl, groupNotificationRows } from "../components/notifications/notification-utils.js";

const appOrigin = "https://operation.propyramakerz.com";
globalThis.window = { location: { origin: appOrigin } };
const urlCases = [
  ["/next/tasks?taskId=123", "/next/tasks?taskId=123"],
  ["/orders/maintenance-orders?id=10", "/next/maintenance-orders?id=10"],
  [`${appOrigin}/next/home`, "/next/home"],
  ["https://external.example.com/next/home", ""],
  ["//external.example.com/path", ""],
  ["javascript:alert(1)", ""],
  ["data:text/html,%3Cscript%3E", ""],
  ["mailto:test@example.org", ""],
];
for (const [input, expected] of urlCases) {
  assert.equal(modernNotificationUrl(input), expected, `Unsafe or broken notification route: ${input}`);
}

const now = Date.now();
const grouped = groupNotificationRows([
  { id: "t1", type: "tasks", title: "Assigned TKT-00021", body: "Started", ts: now },
  { id: "t2", type: "tasks", title: "Assigned TKT-00021", body: "Updated", ts: now - 60000 },
  { id: "t3", type: "tasks", title: "Assigned TKT-00022", body: "Started", ts: now - 120000 },
  { id: "t4", type: "tasks", title: "Assigned TKT-00021", body: "Updated", ts: now - 2 * 60 * 60000 },
]);
assert.deepEqual(grouped.map(g => g.items.map(i => i.id)), [["t1", "t2"], ["t3"], ["t4"]]);

// Verify sensitive regressions at the integration boundary without requiring
// the user's live Supabase, Redis session, VAPID keys or Gmail credentials.
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const logout = read("../app/api/auth/logout/route.js");
assert.match(logout, /getDirectAccountGate\(\[\], \{ authOnly: true \}\)/);
assert.match(logout, /removePushSubscription\(gate\.memberId, endpoint\)/);
assert.ok(logout.indexOf("removePushSubscription(gate.memberId, endpoint)") < logout.indexOf("await logoutDirect("));
const menu = read("../components/UserProfileMenu.jsx");
assert.match(menu, /pushEndpoint: pushSubscription\?\.endpoint/);
assert.match(menu, /pushSubscription\.unsubscribe\(\)/);
const refresh = read("../app/api/notifications/refresh/route.js");
assert.match(refresh, /runNotificationsScan\(\{ force: false \}\)/);
const scanner = read("../lib/notifications-data.js");
assert.match(scanner, /if \(!scanIncomplete\) \{\s*await notificationStateSet\(NOTIFICATION_LASTCHECK_KEY/);
assert.match(scanner, /const value = \(await getNotificationPreferences\(key\)\)\.settings/);

console.log(`PASS: ${urlCases.length} secure routes, grouping, logout privacy and resilient notification scan`);
