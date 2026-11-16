import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const pdf = read("lib/maintenanceReceiptPdf.js");
const exporter = read("lib/order-export-service.js");
const loader = read("lib/order-details-data.js");
const mutation = read("lib/maintenance-orders-data.js");

test("report header shows Request Date using original order creation timestamp, not log time", () => {
  assert.match(pdf, /drawMetaCard\(mL \+ \(colW \+ gap\) \* 2, y, colW, "Request Date", params\.createdAt \? formatDateTime\(params\.createdAt\) : "—"\)/);
  assert.match(exporter, /createdAt: payload\.createdAt/);
  assert.match(loader, /\["notion_created_time", "created_time", "created_at", "Created time"\]/);
});

test("individual maintenance log date is labeled and read only from loggedAt", () => {
  assert.match(pdf, /drawSmallField\(x \+ fieldW \+ gap, y, fieldW, "Log Date", when\)/);
  assert.equal((pdf.match(/const when = item\?\.loggedAt \? formatDateTime\(item\.loggedAt\) : "—";/g) || []).length, 2);
  assert.doesNotMatch(pdf, /formatDateTime\(params\.reportDate/);
  assert.match(exporter, /loggedAt: log\?\.loggedAt \|\| null/);
});

test("database persists maintenance loggedAt within orders.spare_parts_replaced JSON", () => {
  assert.match(mutation, /const maintenanceLoggedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(mutation, /loggedAt: replaceExisting && previousLatest\?\.loggedAt \? previousLatest\.loggedAt/);
  assert.match(mutation, /patch\.spare_parts_replaced = history\.length \? metaText : null/);
  assert.match(mutation, /logs: cleanLogs/);
  assert.match(loader, /\["spare_parts_replaced", "Spare parts replaced"\]/);
  assert.match(loader, /parsed\.logs/);
});

test("missing legacy log date remains unknown instead of impersonating update or export time", () => {
  assert.match(exporter, /loggedAt: item\?\.maintenanceLoggedAt \|\| null/);
  assert.doesNotMatch(exporter, /loggedAt: item\?\.maintenanceLoggedAt \|\| item\?\.updatedTime/);
  assert.match(pdf, /loggedAt: params\.logDate \|\| null/);
  assert.match(pdf, /timeZone: "Africa\/Cairo"/);
});
