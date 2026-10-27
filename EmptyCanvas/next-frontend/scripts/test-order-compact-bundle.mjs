import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Evaluate the pure decoder without loading Next's server-only dependencies.
const source = readFileSync(new URL("../lib/orders-bundle-transport.js", import.meta.url), "utf8")
  .replace("export const BUNDLE_SECTIONS", "const BUNDLE_SECTIONS")
  .replaceAll("export function ", "function ");
const ctx = vm.createContext({});
vm.runInContext(`${source}\nthis.decode = unpackCompactBundle; this.keys = BUNDLE_SECTIONS`, ctx);
const unpack = (bundle) => JSON.parse(JSON.stringify(ctx.decode(bundle)));

function packRows(rows) {
  if (!rows.length) return { keys: [], values: [] };
  const keys = Object.keys(rows[0]).sort();
  if (rows.some((row) => Object.keys(row).sort().join("\u0000") !== keys.join("\u0000"))) {
    return { raw: rows };
  }
  return { keys, values: rows.map((row) => keys.map((key) => row[key])) };
}
function transport(bundle) {
  return {
    transportVersion: 1, version: bundle.version,
    proposalItemsComplete: bundle.proposalItemsComplete,
    dbTimings: bundle.dbTimings,
    sections: Object.fromEntries(Array.from(ctx.keys, (name) => [name, packRows(bundle[name])])),
  };
}
const items = Array.from({ length: 164 }, (_, i) => ({
  id: `row-${i}`, order_number: 3, product_name: i ? "Arduino UNO" : "historic product",
  notion_created_time: "2026-09-07T10:12:00Z", quantity_requested: i * 2,
  source_kits: [{ kitName: "Kit A", quantity: 1, kitId: "a" }],
  extra_nullable_value: null, notes: i === 3 ? "\u0645\u062c\u0645\u0648\u0639\u0629" : "",
  deep: { a: null, nested: [1, false, null, "\u26a1"] },
}));
const bundle = {
  version: 1, rows: items,
  products: [{ id: "prod1", name: "Arduino UNO", url: "", tags: ["Robotics"], unit_price: 33.1 }],
  kitItems: [{ kit_id: "a", product_id: "prod1", quantity: 1 }],
  kits: [{ id: "a", name: "Kit A", folder_id: null }],
  folders: [], proposalItems: [{ proposal_id: "p", product_id: "prod1", source_kits: [] }],
  proposalHeaders: [], proposalItemsComplete: true, dbTimings: { rows: 13.2 },
};
assert.deepEqual(unpack(transport(bundle)), bundle, "all fields and nested values must round-trip losslessly");
const missingKeys = structuredClone(bundle);
missingKeys.rows[0] = { id: "legacy-only" };
assert.deepEqual(unpack(transport(missingKeys)), missingKeys, "mixed row shapes use raw fallback");
const invalid = transport(bundle);
invalid.sections.rows.values[0].pop();
assert.throws(() => unpack(invalid), /Incomplete/);
const packed = transport(bundle);
const baseline = Buffer.byteLength(JSON.stringify(bundle));
const compact = Buffer.byteLength(JSON.stringify(packed));
console.log(`Compact bundle JS compatibility: PASS. Synthetic example: ${baseline} -> ${compact} bytes (${Math.round((1 - compact / baseline) * 100)}% smaller).`);
