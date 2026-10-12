import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Test the pure classifier without Next's server-only imports.
const file = readFileSync(new URL("../lib/order-proposal-bundle-resolution.js", import.meta.url), "utf8");
const code = file.replace("export function classifyBundleProposalSources", "function classifyBundleProposalSources");
const ctx = vm.createContext({});
vm.runInContext(code + "\nthis.classify = classifyBundleProposalSources", ctx);
const classify = ctx.classify;
const proposalId = "proposal-1";
const row = { product_id: "deleted-product", product_name: "Historic Motor" };
const current = [{ proposal_id: proposalId, product_id: "other-id", product_name: "Other Motor", source_kits: [] }];
assert.equal(classify(row, proposalId, current).kind, "unknown", "old partial bundle must fall back");
const noMatch = classify(row, proposalId, current, { complete: true });
assert.equal(noMatch.kind, "confirmed-empty", "new complete proposal cannot recover a missing product");
assert.equal(noMatch.reason, "no-match");
const found = [{ proposal_id: proposalId, product_id: row.product_id, product_name: row.product_name,
  source_kits: [{ kitName: "Legacy kit", quantity: 2 }] }];
assert.equal(classify(row, proposalId, found, { complete: true }).kind, "found", "preserve sources");
const empty = [{ ...found[0], source_kits: [] }];
assert.equal(classify(row, proposalId, empty, { complete: true }).kind, "confirmed-empty");
const malformed = [{ ...found[0], source_kits: "BROKEN JSON" }];
assert.equal(classify(row, proposalId, malformed, { complete: true }).kind, "unknown", "never assume malformed source empty");
assert.equal(classify(row, "", [], { complete: true }).kind, "unknown", "missing proposal ID requires fallback");
console.log("full proposal bundle classification: PASS");
