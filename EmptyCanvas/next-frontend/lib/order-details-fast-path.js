import "server-only";

import { performance } from "node:perf_hooks";
import { rpc } from "./supabase-rest";
import { serializeProduct } from "./products-service";
import { classifyBundleProposalSources } from "./order-proposal-bundle-resolution";

const RPC_NAME = "erp_order_detail_bundle_v1";
const canonicalTables = [
  ["SUPABASE_ORDERS_TABLE", "orders"],
  ["SUPABASE_PRODUCTS_TABLE", "products"],
  ["SUPABASE_PRODUCT_KITS_TABLE", "product_kits"],
  ["SUPABASE_PRODUCT_KIT_ITEMS_TABLE", "product_kit_items"],
  ["SUPABASE_PRODUCT_KIT_FOLDERS_TABLE", "product_kit_folders"],
  ["SUPABASE_PRODUCT_PROPOSALS_TABLE", "product_proposals"],
  ["SUPABASE_PRODUCT_PROPOSAL_ITEMS_TABLE", "product_proposal_items"],
];
function usesCanonicalTables(rawOnly = false) {
  const tables = rawOnly ? canonicalTables.slice(0, 1) : canonicalTables;
  return tables.every(([env, table]) => !value(process.env[env]) || value(process.env[env]) === table);
}
// A missing SQL migration should not cause an extra failed RPC on every tap.
let unavailableUntil = 0;

const value = (x) => String(x ?? "").trim();
const canonical = (x) => value(x).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function validBundle(bundle, ids) {
  if (Number(bundle?.version) !== 1 || !Array.isArray(bundle?.rows)) return false;
  if (!Array.isArray(bundle?.products) || !Array.isArray(bundle?.kitItems)
    || !Array.isArray(bundle?.kits) || !Array.isArray(bundle?.folders)
    || !Array.isArray(bundle?.proposalItems)
    || !Array.isArray(bundle?.proposalHeaders)) return false;
  const expected = new Set(ids.map(value));
  const returned = bundle.rows.map((row) => value(row?.id));
  return returned.length === expected.size && new Set(returned).size === expected.size
    && returned.every((id) => expected.has(id));
}

// Keep this pure so the completeness and legacy fallback conditions can be
// exercised without a live Supabase connection.
export function makeFastOrderReferences(bundle) {
  if (!bundle || !Array.isArray(bundle.rows)) return null;
  const rows = bundle.rows.map((row) => ({ ...row }));
  const dedupedProducts = new Map();
  for (const raw of bundle.products) {
    const p = serializeProduct(raw);
    if (p.id && !dedupedProducts.has(p.id)) dedupedProducts.set(p.id, p);
  }
  const products = [...dedupedProducts.values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const productById = new Map(products.map((p) => [value(p.id), p]));
  const productByName = new Map();
  const productByUrl = new Map();
  for (const p of products) {
    if (!productByName.has(canonical(p.name))) productByName.set(canonical(p.name), p);
    if (value(p.url) && !productByUrl.has(value(p.url).toLowerCase())) {
      productByUrl.set(value(p.url).toLowerCase(), p);
    }
  }

  // Names/URLs on historical order rows may differ from the current catalog,
  // and a product may have been deleted. Do NOT reject the complete bundle for
  // that reason: the legacy enrich path already uses exact stored product name
  // or URL for metadata, and keeps the original row if no match exists.
  // In particular, never use a mismatched ID to replace the saved product.
  let missingProductMatches = 0;
  for (const row of rows) {
    const name = canonical(row.product_name);
    const url = value(row.product_url).toLowerCase();
    const current = productById.get(value(row.product_id));
    const matchingById = current && ((!name && !url)
      || (name && name === canonical(current.name))
      || (url && url === value(current.url).toLowerCase()));
    if (!matchingById && !(name && productByName.has(name))
        && !(url && productByUrl.has(url))) missingProductMatches++;
  }

  const kitById = new Map(bundle.kits.map((kit) => [value(kit.id), kit]));
  const folderById = new Map(bundle.folders.map((folder) => [value(folder.id), folder]));
  const membershipsByProduct = new Map();
  let orphanKitMemberships = 0;
  for (const item of bundle.kitItems) {
    const productId = value(item.product_id);
    const kitId = value(item.kit_id);
    const kit = kitById.get(kitId);
    // The original membership snapshot ignores an orphan membership; a
    // deleted folder is presented as "Unfiled Kits" by the normal grouping.
    if (!productId || !kitId || !kit) { orphanKitMemberships++; continue; }
    if (!membershipsByProduct.has(productId)) membershipsByProduct.set(productId, new Map());
    membershipsByProduct.get(productId).set(kitId, value(kit.name) || "Untitled kit");
  }
  const memberships = [...membershipsByProduct.entries()].map(([productId, list]) => ({
    productId,
    kits: [...list.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
  const kits = bundle.kits.map((kit) => ({
    id: value(kit.id), name: value(kit.name), folderId: value(kit.folder_id),
  }));
  const folders = bundle.folders.map((folder) => ({ id: value(folder.id), name: value(folder.name) }));

  // Proposal-generated orders missing source_kits must be rehydrated from the
  // exact original proposal AND product. Do not borrow another proposal's kit.
  const proposalByName = new Map();
  for (const header of bundle.proposalHeaders.slice().sort((a, b) =>
    value(b.updated_at).localeCompare(value(a.updated_at)))) {
    const key = canonical(header.name);
    if (key && !proposalByName.has(key)) proposalByName.set(key, header);
  }
  let proposalRecovery = false;
  const confirmedEmptySourceIds = [];
  const fullProposalLookupIds = [];
  let unmatchedCompleteProposalRows = 0;
  for (const row of rows) {
    let sources = row.source_kits;
    if (typeof sources === "string") {
      try { sources = JSON.parse(sources); } catch { sources = []; }
    }
    if (Array.isArray(sources) && sources.length) continue;
    const description = value(row.issue_description);
    const proposalGenerated = value(row.source_proposal_id) || value(row.source_proposal_name)
      || /^created\s+from\s+proposal\s*:/i.test(description);
    if (!proposalGenerated) continue;
    const nameFromIssue = description.match(/^created\s+from\s+proposal\s*:\s*(.+)$/i)?.[1];
    const proposalName = value(row.source_proposal_name) || value(nameFromIssue);
    const proposalId = value(row.source_proposal_id)
      || value(proposalByName.get(canonical(proposalName))?.id);
    if (!proposalId) { proposalRecovery = true; continue; }
    const sourceMatch = classifyBundleProposalSources(row, proposalId, bundle.proposalItems, {
      complete: bundle.proposalItemsComplete === true,
    });
    if (sourceMatch.kind === "confirmed-empty") {
      // The live RPC either proved the exact match has an empty source array,
      // or (Phase 19 only) supplied the WHOLE original proposal and confirmed
      // there is no matching product at all. The legacy full read cannot find
      // new sources in either case. Preserve the stored kit-tag fallback.
      if (sourceMatch.reason === "no-match") unmatchedCompleteProposalRows++;
      confirmedEmptySourceIds.push(value(row.id));
      continue;
    }
    if (sourceMatch.kind !== "found") {
      // No matching proposal row, a malformed source or an ambiguous historic
      // link: use the full-fidelity lookup. The targeted lookup would repeat
      // the same exact-ID query already included inside the live bundle.
      fullProposalLookupIds.push(value(row.id));
      proposalRecovery = true;
      continue;
    }
    row.source_kits = sourceMatch.sources;
    row.source_proposal_id = proposalId;
    if (!value(row.source_proposal_name) && proposalName) row.source_proposal_name = proposalName;
  }

  // Same deterministic ordering as the original sorted REST detail list.
  rows.sort((a, b) => value(b.notion_created_time).localeCompare(value(a.notion_created_time))
    || value(b.id).localeCompare(value(a.id)));
  return {
    rows,
    references: { products, kitReferences: { memberships, kits }, folders, confirmedEmptySourceIds, fullProposalLookupIds },
    proposalRecovery,
    missingProductMatches,
    orphanKitMemberships,
    unmatchedCompleteProposalRows,
    completeProposalSnapshot: bundle.proposalItemsComplete === true,
  };
}

export async function loadFastOrderDetailsBundle(ids = [], { timings = null } = {}) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map(value).filter(Boolean))];
  if (!clean.length || clean.length > 500 || !usesCanonicalTables()
      || Date.now() < unavailableUntil) return null;
  const startedAt = performance.now();
  try {
    // The RPC is a single *live* read. It never returns another user's
    // privately cached details. The route has already checked user access.
    const bundle = await rpc(RPC_NAME, { p_ids: clean }, {
      profileName: "orders.details-one-call",
      timeoutMs: 9000,
      onNetworkTiming: timings ? ({ headersMs, bodyMs, parseMs, payloadBytes }) => {
        timings.bundleHeaders = headersMs;
        timings.bundleBody = bodyMs;
        timings.bundleParse = parseMs;
        timings.bundlePayloadBytes = payloadBytes;
      } : undefined,
    });
    const valid = validBundle(bundle, clean);
    const ready = valid ? makeFastOrderReferences(bundle) : null;
    if (timings) {
      timings.bundle = performance.now() - startedAt;
      // SQL-side measurements separate PostgreSQL work from PostgREST/network
      // and Vercel cold-connection latency. Never include actual order data.
      const dbStages = {
        rows: "bundleDbRows",
        proposalHeaders: "bundleDbProposalHeaders",
        productsId: "bundleDbProductsId",
        productsName: "bundleDbProductsName",
        kitItems: "bundleDbKitItems",
        kits: "bundleDbKits",
        folders: "bundleDbFolders",
        proposalItems: "bundleDbProposalItems",
        proposalScanSkipped: "bundleProposalScanSkipped",
      };
      for (const [key, target] of Object.entries(dbStages)) {
        const duration = Number(bundle?.dbTimings?.[key]);
        if (Number.isFinite(duration) && duration >= 0) timings[target] = duration;
      }
      if (!valid) timings.bundleInvalid = 1;
      if (ready) {
        timings.bundleProductMiss = ready.missingProductMatches;
        timings.bundleKitOrphans = ready.orphanKitMemberships;
        timings.bundleProposalRecovery = Number(ready.proposalRecovery);
        timings.bundleProposalEmpty = ready.references.confirmedEmptySourceIds.length;
        timings.bundleProposalFullOnly = ready.references.fullProposalLookupIds.length;
        timings.bundleProposalNoMatch = ready.unmatchedCompleteProposalRows;
        timings.bundleProposalComplete = Number(ready.completeProposalSnapshot);
      }
    }
    return ready;
  } catch (error) {
    if (timings) {
      timings.bundle = performance.now() - startedAt;
      timings.bundleError = 1;
      timings.bundleErrorStatus = Number(error?.status) || 0;
    }
    const message = [error?.message, error?.details?.code].filter(Boolean).join(" ");
    if (/PGRST202|42883|could not find the function|schema cache/i.test(message)) {
      unavailableUntil = Date.now() + 60_000;
    }
    // Never return partial, stale or unauthorized order details. All existing
    // REST behavior remains in place for custom/migrated Supabase schemas.
    return null;
  }
}

/** Fast raw-only read for My Orders; ownership is checked by its caller. */
export async function loadFastRawOrderRows(ids = [], { timings = null } = {}) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map(value).filter(Boolean))];
  if (!clean.length || clean.length > 500 || !usesCanonicalTables(true)
      || Date.now() < unavailableUntil) return null;
  const startedAt = performance.now();
  try {
    const rows = await rpc("erp_order_detail_rows_v1", { p_ids: clean }, {
      profileName: "orders.details-raw-one-call", timeoutMs: 9000,
    });
    if (timings) timings.bundle = performance.now() - startedAt;
    const expected = new Set(clean);
    const found = Array.isArray(rows) ? rows.map((row) => value(row?.id)) : [];
    if (found.length !== expected.size || new Set(found).size !== expected.size
        || found.some((id) => !expected.has(id))) return null;
    return rows.sort((a, b) => value(b.notion_created_time).localeCompare(value(a.notion_created_time))
      || value(b.id).localeCompare(value(a.id)));
  } catch (error) {
    if (timings) timings.bundle = performance.now() - startedAt;
    if (/PGRST202|42883|could not find the function|schema cache/i.test(
      [error?.message,error?.details?.code].filter(Boolean).join(" "))) {
      unavailableUntil = Date.now() + 60_000;
    }
    return null;
  }
}
