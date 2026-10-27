import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { collectSourceKits, removeSourceKitFromDraft } from "../lib/proposal-source-kit-management.mjs";

const a = { id: "p1", productId: "p1", quantity: 10, sourceKits: [
  { kitId: "kit-1", kitName: "G1", quantity: 4 },
  { kitId: "kit-2", kitName: "G2", quantity: 6 },
] };
const b = { id: "p2", productId: "p2", quantity: 3, sourceKits: [{ kitId: "kit-1", kitName: "G1", quantity: 3 }] };
const direct = { id: "p3", quantity: 2, sourceKits: [{ kitId: "", kitName: "Direct components", quantity: 2 }] };
const items = [a, b, direct];
const initial = structuredClone(items);
const grouped = collectSourceKits(items, [
  { id: "kit-1", name: "G1", folderId: "theme-1" },
  { id: "kit-2", name: "G2", folderId: "theme-1" },
], [{ id: "theme-1", name: "Theme One" }]);
assert.equal(grouped.length, 1);
assert.equal(grouped[0].name, "Theme One");
assert.equal(grouped[0].kits.length, 2);
assert.equal(grouped[0].kits[0].totalQuantity, 7);
assert.equal(grouped[0].kits[0].components, 2);
const next = removeSourceKitFromDraft(items, "kit-1");
assert.equal(next.length, 2, "one exclusive kit component removed, another shared component retained");
assert.equal(next[0].quantity, 6);
assert.equal(next[0].sourceKits[0].kitId, "kit-2");
assert.deepEqual(next[1], direct, "direct components stay untouched");
assert.deepEqual(items, initial, "all draft operations are immutable");
assert.equal(removeSourceKitFromDraft(items, "kit-2")[0].quantity, 4);
assert.throws(() => removeSourceKitFromDraft(items, "kit-nope"), /no longer/);
assert.throws(() => removeSourceKitFromDraft([{ ...a, quantity: 12 }], "kit-1"), /don't match/);
const inconsistent = collectSourceKits([{ ...a, quantity: 12 }]);
assert.equal(inconsistent[0].kits[0].canRemove, false, "never offer unsafe removal");
assert.equal(collectSourceKits([{ ...a, sourceKits: [{ kitId: "", kitName: "Direct", quantity: 10 }] }]).length, 0);
const sql = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase_proposal_remove_source_kit.sql"), "utf8");
assert.match(sql, /for update/);
assert.match(sql, /v_source_qty <> v_item.quantity/);
assert.match(sql, /p_expected_components/);
assert.match(sql, /revoke all .* from anon/);
assert.match(sql, /grant execute .* to service_role/);
console.log("PASS: source-kit folders, component overlap, direct items, safety, SQL guardrails");
