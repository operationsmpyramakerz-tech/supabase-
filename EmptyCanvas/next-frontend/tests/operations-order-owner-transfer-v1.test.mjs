import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateWholeOperationsOrder } from "../lib/operations-whole-order-policy.mjs";

const code = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

test("whole-order validation rejects partial orders before a transfer", () => {
  const selected = [{ id: "10", order_number: 166 }, { id: "11", order_number: 166 }];
  assert.equal(validateWholeOperationsOrder(["10", "11"], selected, selected).ok, true);
  assert.equal(validateWholeOperationsOrder(["10"], [selected[0]], selected).ok, false);
  assert.equal(validateWholeOperationsOrder(["10", "11"], selected, [
    selected[0], { id: "11", order_number: 167 },
  ]).ok, false);
});

test("creator picker is server-provided and Save handles creator-only changes", () => {
  const ui = code("../components/orders/OperationsOrdersClient.jsx");
  const modal = code("../components/orders/OperationsOrdersHeavyModals.jsx");
  const picker = code("../components/orders/OrderCreatorTransferField.jsx");
  const service = code("../lib/operations-orders-data.js");
  assert.ok(ui.includes("creatorOriginalId: text(data?.orderCreator?.id)"));
  assert.ok(ui.includes("teamMembers: Array.isArray(data?.teamMembers)"));
  assert.ok(ui.includes("const creatorChanged = Boolean(selectedCreatorId"));
  assert.ok(ui.includes("newCreatorId: selectedCreatorId"));
  assert.ok(ui.includes("expectedCreatorId: text(editMode.creatorOriginalId)"));
  assert.ok(modal.includes("onSelectEditCreator={onSelectEditCreator}"));
  assert.ok(modal.includes("<OrderCreatorTransferField"));
  assert.ok(modal.includes("!creatorChanged && !Object.keys(editChanges).length"));
  assert.ok(picker.includes("role=\"listbox\""));
  assert.ok(picker.includes('placeholder="Search team members…"'));
  assert.ok(service.includes("orderCreator: {"));
  assert.ok(service.includes("teamMembers: (Array.isArray(teamMembers)"));
});

test("server verifies permission, existing owner, entire order and persisted member ID", () => {
  const api = code("../app/api/orders/operations/mutations-direct/route.js");
  const service = code("../lib/operations-orders-data.js");
  const transfer = code("../lib/operations-order-owner-transfer.js");
  assert.ok(api.includes('"edit-save": "orders.operations.edit"'));
  assert.ok(api.includes("await assertOrderIdsInScope("));
  assert.ok(api.includes("newCreatorId: body?.newCreatorId"));
  assert.ok(service.includes('featureAllowed(account || {}, "orders.operations.edit")'));
  assert.ok(service.includes('resolveOrderScope(account || {}, "orders.operations.edit")'));
  assert.ok(service.includes("preparedTransfer = transferRequested ? await prepareOperationsCreatorTransfer"));
  assert.ok(service.includes("if (preparedTransfer && !hasComponentChanges)"));
  assert.ok(service.includes("const reassigned = preparedTransfer ? await commitOperationsCreatorTransfer"));
  assert.ok(transfer.includes("listTeamMembersLite({ fresh: true })"));
  assert.ok(transfer.includes("validateWholeOperationsOrder(ids, rows, fullRows)"));
  assert.ok(transfer.includes("team_member_id: next.id, team_member_name: next.name"));
  assert.ok(transfer.includes('method: "PATCH", headers: { Prefer: "return=representation" }'));
  assert.ok(transfer.includes('actionKey: "orders.operations.transfer_creator"'));
  assert.ok(transfer.includes('order_number: `eq.${number}`, select: "id"'));
  assert.ok(!transfer.includes("updateById("), "the new owner must not be written one component at a time");
});

test("ownership transfer does not automatically move stocktaking or alter order dates", () => {
  const transfer = code("../lib/operations-order-owner-transfer.js");
  const service = code("../lib/operations-orders-data.js");
  const picker = code("../components/orders/OrderCreatorTransferField.jsx");
  assert.ok(!/body:\s*\{[^}]*notion_created_time/.test(transfer));
  assert.ok(!/body:\s*\{[^}]*status/.test(transfer));
  assert.ok(!/body:\s*\{[^}]*stocktaking/.test(transfer));
  assert.ok(picker.includes("Already delivered Stocktaking balances will not move automatically."));
  assert.ok(service.includes("if (preparedTransfer && !plannedFinalRows.length)"));
});
