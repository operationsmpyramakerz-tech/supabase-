import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sql = read("2026-11-24-operations-linked-receipts-v423.sql");
const previous = read("2026-11-16-operations-legacy-unreceived-v422.sql");
const backend = read("lib/operations-orders-data.js");
const route = read("app/api/orders/operations/mutations-direct/route.js");
const client = read("components/orders/OperationsOrdersClient.jsx");
const modal = read("components/orders/OperationsOrdersHeavyModals.jsx");

test("new RPC is opt-in, server-only, and does not overwrite V422", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.operations_receive_remaining_v423\(/);
  assert.match(sql, /p_legacy_link_confirmed boolean DEFAULT false/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.operations_receive_remaining_v423\(jsonb, text, text, text, boolean\) TO service_role/);
  assert.match(sql, /REVOKE ALL ON FUNCTION .* FROM anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION .* FROM authenticated/);
  assert.match(previous, /CREATE OR REPLACE FUNCTION public\.operations_receive_remaining_v421\(/);
});

test("linked legacy row cannot be received without explicit reconciliation confirmation", () => {
  const linked = sql.slice(sql.indexOf("IF v_stock_linked THEN"), sql.indexOf("-- The component is genuinely still outstanding"));
  assert.ok(linked.length > 200);
  assert.match(linked, /IF p_legacy_link_confirmed IS DISTINCT FROM TRUE THEN/);
  assert.match(linked, /RAISE EXCEPTION/);
  assert.match(linked, /'status', 'Shipped'/);
  assert.match(linked, /'quantity_received_by_operations', v_now/);
  assert.match(linked, /'quantity_remaining', v_remaining - v_now/);
  assert.match(linked, /RETURNING id/);
  assert.match(linked, /UPDATE public\.orders\s+SET quantity_requested = 0/);
  assert.match(linked, /v_reconciled_ids := v_reconciled_ids/);
  assert.match(linked, /CONTINUE;/);
  // The original Stocktaking record, even when balance zero, is never modified.
  assert.doesNotMatch(sql, /UPDATE public\.stocktaking|DELETE FROM public\.stocktaking|INSERT INTO public\.stocktaking/);
  assert.match(sql, /WHERE source_order_id::text = v_id::text/);
});

test("receiving an already-shipped row uses the unchanged cumulative path", () => {
  assert.match(sql, /ELSE\s+-- A still-Shipped component/);
  assert.match(sql, /quantity_received_by_operations = v_received \+ v_now/);
  assert.match(sql, /quantity_remaining = v_remaining - v_now/);
  assert.match(sql, /v_now > v_remaining/);
  assert.match(sql, /FOR UPDATE/);
});

test("both server and UI require verified operator acknowledgement for linked legacy records", () => {
  assert.ok(backend.includes('"/rpc/operations_receive_remaining_v423"'));
  assert.ok(backend.includes("p_legacy_link_confirmed: legacyLinkConfirmed === true"));
  assert.ok(backend.includes("if (legacyLinkConfirmed === true)"));
  assert.ok(backend.includes('"orders.operations.receive_legacy_linked_batch"'));
  assert.ok(backend.includes('"/rpc/operations_receive_remaining_v421"'));
  assert.ok(route.includes("legacyLinkConfirmed: body?.legacyLinkConfirmed === true"));
  assert.ok(client.includes("action: receiveAnotherBatch ?"));
  assert.ok(modal.includes('const [legacyLinkConfirmed, setLegacyLinkConfirmed] = useState(false)'));
  assert.ok(modal.includes("const needsLegacyReview = selectedLegacyCandidates.length > 0"));
  assert.ok(modal.includes("legacyLinkConfirmed: needsLegacyReview && legacyLinkConfirmed"));
  assert.ok(modal.includes("needsLegacyReview && !legacyLinkConfirmed"));
});
