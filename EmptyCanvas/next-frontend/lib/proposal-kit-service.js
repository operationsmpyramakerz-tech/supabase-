import "server-only";
import {
  deleteById,
  getSupabaseConfig,
  insert,
  selectAll,
  selectById,
  supabaseRequest,
  updateById,
} from "./supabase-rest";
import { verifyPageAdminPasswordDirect } from "./order-action-auth";
import { getProductsList } from "./products-service";
import { sendProductEntriesToStocktaking } from "./stocktaking-data";
import {
  canUseKitHeadersRpc,
  canUseProposalHeadersRpc,
  loadKitHeadersRpc,
  loadProposalHeadersRpc,
  noteKitHeadersRpcError,
  noteProposalHeadersRpcError,
} from "./proposal-kit-summary-rpc";

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInt(value, fallback = 1) {
  return Math.max(1, Math.round(number(value) || fallback));
}

function sourceKits(value) {
  const raw = Array.isArray(value) ? value : (() => {
    if (!value || typeof value !== "string") return [];
    try { return JSON.parse(value); } catch { return []; }
  })();
  return (Array.isArray(raw) ? raw : [])
    .map((source, index) => ({
      kitId: text(source?.kitId || source?.kit_id || source?.id),
      kitName: text(source?.kitName || source?.kit_name || source?.name),
      quantity: positiveInt(source?.quantity || source?.qty),
      order: Number.isFinite(Number(source?.order)) ? Number(source.order) : index,
    }))
    .filter((source) => source.kitId || source.kitName);
}

function mergeSourceKits(existingSources, incomingSources, existingQuantity, incomingQuantity, logic = "add") {
  const existing = sourceKits(existingSources);
  const incoming = sourceKits(incomingSources);
  const existingQty = positiveInt(existingQuantity);
  const incomingQty = positiveInt(incomingQuantity);
  const cleanLogic = text(logic).toLowerCase();
  if (cleanLogic === "max") return incomingQty > existingQty ? incoming : existing;
  if (cleanLogic === "min") return incomingQty < existingQty ? incoming : existing;
  if (!incoming.length) return existing;
  const merged = new Map();
  [...existing, ...incoming].forEach((source, index) => {
    const key = source.kitId || `name:${source.kitName.toLowerCase()}`;
    const current = merged.get(key);
    if (current) current.quantity += positiveInt(source.quantity);
    else merged.set(key, { ...source, order: Number.isFinite(Number(source.order)) ? Number(source.order) : index });
  });
  return [...merged.values()].sort((a, b) => a.order - b.order);
}

function encode(value) {
  return encodeURIComponent(text(value));
}

function proposalTable() {
  return text(process.env.SUPABASE_PRODUCT_PROPOSALS_TABLE || "product_proposals") || "product_proposals";
}

function proposalItemsTable() {
  return text(process.env.SUPABASE_PRODUCT_PROPOSAL_ITEMS_TABLE || "product_proposal_items") || "product_proposal_items";
}

function kitsTable() {
  return text(process.env.SUPABASE_PRODUCT_KITS_TABLE || "product_kits") || "product_kits";
}

function kitItemsTable() {
  return text(process.env.SUPABASE_PRODUCT_KIT_ITEMS_TABLE || "product_kit_items") || "product_kit_items";
}

function kitFoldersTable() {
  return text(process.env.SUPABASE_PRODUCT_KIT_FOLDERS_TABLE || "product_kit_folders") || "product_kit_folders";
}

// Cache only account-independent Supabase snapshots. Permission-derived fields
// such as `canEdit` are applied after the current account gate resolves, so a
// cached row set can never leak one user's authorization state to another.
const PROPOSAL_KIT_READ_CACHE_TTL_MS = 20_000;
const PROPOSAL_KIT_READ_CACHE_MAX_ENTRIES = 8;
const proposalKitReadCache = new Map();
const proposalKitReadInflight = new Map();
let proposalKitCacheGeneration = 0;
let proposalHeaderProjectionSupported = null;
let kitHeaderProjectionSupported = null;

const PROPOSAL_HEADER_SELECT = "id,name,created_by,created_by_id,created_at,updated_at,combined_sources,combine_logic";
const KIT_HEADER_SELECT = "id,name,created_by,created_by_id,created_at,updated_at,folder_id";

function proposalKitCacheGet(key) {
  const entry = proposalKitReadCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    proposalKitReadCache.delete(key);
    return null;
  }
  return entry.value;
}

function proposalKitCacheSet(key, value, ttlMs = PROPOSAL_KIT_READ_CACHE_TTL_MS) {
  if (proposalKitReadCache.size >= PROPOSAL_KIT_READ_CACHE_MAX_ENTRIES && !proposalKitReadCache.has(key)) {
    const oldest = proposalKitReadCache.keys().next().value;
    if (oldest) proposalKitReadCache.delete(oldest);
  }
  proposalKitReadCache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || PROPOSAL_KIT_READ_CACHE_TTL_MS),
  });
}

async function proposalKitCachedRead(key, loader, { fresh = false, ttlMs = PROPOSAL_KIT_READ_CACHE_TTL_MS } = {}) {
  if (!fresh) {
    const cached = proposalKitCacheGet(key);
    if (cached !== null) return cached;
    if (proposalKitReadInflight.has(key)) return await proposalKitReadInflight.get(key);
  }

  const generation = proposalKitCacheGeneration;
  const pending = Promise.resolve().then(loader);
  if (!fresh) proposalKitReadInflight.set(key, pending);
  try {
    const value = await pending;
    // If a write invalidated caches while this read was in flight, never let
    // the older snapshot repopulate the cache after the mutation completed.
    if (generation === proposalKitCacheGeneration) proposalKitCacheSet(key, value, ttlMs);
    return value;
  } finally {
    if (!fresh) proposalKitReadInflight.delete(key);
  }
}

function invalidateProposalKitReadCaches(...prefixes) {
  proposalKitCacheGeneration += 1;
  const wanted = prefixes.flat().map((value) => text(value)).filter(Boolean);
  if (!wanted.length) {
    proposalKitReadCache.clear();
    proposalKitReadInflight.clear();
    return;
  }
  for (const key of [...proposalKitReadCache.keys()]) {
    if (wanted.some((prefix) => key === prefix || key.startsWith(`${prefix}:`))) proposalKitReadCache.delete(key);
  }
  for (const key of [...proposalKitReadInflight.keys()]) {
    if (wanted.some((prefix) => key === prefix || key.startsWith(`${prefix}:`))) proposalKitReadInflight.delete(key);
  }
}

function accountIdentity(account = {}) {
  const id = text(
    account.id ?? account.userId ?? account.user_id ?? account.memberId ?? account.member_id ??
    account.teamMemberId ?? account.team_member_id ?? account.notionId ?? account.notion_id,
  );
  const name = text(
    account.name ?? account.fullName ?? account.full_name ?? account.username ?? account.displayName ??
    account.display_name ?? account.email,
  );
  return { id, name };
}

function isOwner(row = {}, account = {}) {
  const identity = accountIdentity(account);
  const createdId = text(row.created_by_id);
  const createdName = text(row.created_by);
  if (createdId && identity.id) return createdId === identity.id;
  if (createdName && identity.name) return createdName.toLowerCase() === identity.name.toLowerCase();
  return false;
}

async function verifyAdmin(account, password) {
  const clean = text(password);
  if (!clean) return false;
  const verified = await verifyPageAdminPasswordDirect(account || {}, clean, ["Proposals", "Kits", "Products"]);
  if (verified === null) {
    const error = new Error("The direct Admin password context is unavailable.");
    error.status = 503;
    throw error;
  }
  return verified;
}

async function requireOwnerOrAdmin(row, account, adminPassword) {
  if (isOwner(row, account)) return;
  if (await verifyAdmin(account, adminPassword)) return;
  const error = new Error("Admin password is required to modify an item created by another user.");
  error.status = 403;
  throw error;
}

async function rowsByForeignKey(table, column, id, order = "created_at.asc,id.asc") {
  const rows = await supabaseRequest(
    `/${encodeURIComponent(table)}?select=*&${encodeURIComponent(column)}=eq.${encode(id)}&order=${encodeURIComponent(order)}`,
  );
  return Array.isArray(rows) ? rows : [];
}

async function deleteRowsByForeignKey(table, column, id) {
  return await supabaseRequest(
    `/${encodeURIComponent(table)}?${encodeURIComponent(column)}=eq.${encode(id)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  );
}

function proposalItem(row = {}) {
  return {
    id: text(row.id),
    proposalId: text(row.proposal_id),
    productId: text(row.product_id),
    productName: text(row.product_name) || "Untitled product",
    quantity: positiveInt(row.quantity),
    sourceKits: sourceKits(row.source_kits),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function kitItem(row = {}) {
  return {
    id: text(row.id),
    kitId: text(row.kit_id),
    productId: text(row.product_id),
    productName: text(row.product_name) || "Untitled product",
    quantity: positiveInt(row.quantity),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function proposalHeader(row = {}, itemCount = 0, account = {}) {
  return {
    id: text(row.id),
    name: text(row.name) || "Untitled proposal",
    createdBy: text(row.created_by),
    createdById: text(row.created_by_id),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    itemsCount: Number(itemCount) || 0,
    canEdit: isOwner(row, account),
    combinedSources: Array.isArray(row.combined_sources) ? row.combined_sources : [],
    combineLogic: text(row.combine_logic),
    combineNote: text(row.combine_note),
    combinedMatrix: Array.isArray(row.combined_matrix) ? row.combined_matrix : [],
    source: "supabase-next",
  };
}

function kitHeader(row = {}, itemCount = 0, account = {}) {
  return {
    id: text(row.id),
    name: text(row.name) || "Untitled kit",
    createdBy: text(row.created_by),
    createdById: text(row.created_by_id),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    folderId: text(row.folder_id),
    itemsCount: Number(itemCount) || 0,
    canEdit: isOwner(row, account),
    source: "supabase-next",
  };
}

function kitFolderHeader(row = {}, account = {}) {
  return {
    id: text(row.id),
    name: text(row.name) || "Untitled folder",
    createdBy: text(row.created_by),
    createdById: text(row.created_by_id),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    canEdit: isOwner(row, account),
    source: "supabase-next",
  };
}

async function requireKitFolder(folderId) {
  const id = text(folderId);
  if (!id) return null;
  const folder = await selectById(kitFoldersTable(), id);
  if (!folder) {
    const error = new Error("Kit folder not found.");
    error.status = 404;
    throw error;
  }
  return folder;
}

async function proposalHeaderRowsCompact() {
  if (proposalHeaderProjectionSupported !== false) {
    try {
      const rows = await selectAll(proposalTable(), {
        limit: 5000,
        order: "updated_at.desc,created_at.desc",
        select: PROPOSAL_HEADER_SELECT,
        profileName: "proposals.headers-compact",
      });
      proposalHeaderProjectionSupported = true;
      return rows;
    } catch {
      // Customized/legacy schemas may use non-canonical header column names.
      // Remember compatibility mode so we do not pay for a failed projection
      // on every cache miss.
      proposalHeaderProjectionSupported = false;
    }
  }
  return await selectAll(proposalTable(), {
    limit: 5000,
    order: "updated_at.desc,created_at.desc",
    profileName: "proposals.headers-fallback",
  });
}

async function kitHeaderRowsCompact() {
  if (kitHeaderProjectionSupported !== false) {
    try {
      const rows = await selectAll(kitsTable(), {
        limit: 5000,
        order: "updated_at.desc,created_at.desc",
        select: KIT_HEADER_SELECT,
        profileName: "kits.headers-compact",
      });
      kitHeaderProjectionSupported = true;
      return rows;
    } catch {
      kitHeaderProjectionSupported = false;
    }
  }
  return await selectAll(kitsTable(), {
    limit: 5000,
    order: "updated_at.desc,created_at.desc",
    profileName: "kits.headers-fallback",
  });
}

async function proposalItemCountsForHeaders(headers = []) {
  const proposalIds = [...new Set((headers || []).map((row) => text(row?.id)).filter(Boolean))];
  const itemCounts = new Map();
  if (!proposalIds.length) return itemCounts;

  // The self-hosted PostgREST instance can cap a response below the requested
  // limit (commonly 1,000 rows). Using 5,000 here made the loop think it had
  // reached the final page after the first capped response, so proposal cards
  // showed partial counts. Keep each page safely below the server cap and
  // continue until a genuinely short page is returned.
  const pageSize = 500;
  const inList = postgrestInList(proposalIds);
  for (let offset = 0; ; offset += pageSize) {
    const rows = await supabaseRequest(
      `/${encodeURIComponent(proposalItemsTable())}?select=proposal_id&proposal_id=in.(${encodeURIComponent(inList)})&order=id.asc&limit=${pageSize}&offset=${offset}`,
      { profileName: "proposals.count-items-fallback" },
    );
    const page = Array.isArray(rows) ? rows : [];
    for (const row of page) {
      const proposalId = text(row?.proposal_id);
      if (proposalId) itemCounts.set(proposalId, (itemCounts.get(proposalId) || 0) + 1);
    }
    if (page.length < pageSize) break;
  }

  return itemCounts;
}

async function kitItemCountsForHeaders(headers = []) {
  const kitIds = [...new Set((headers || []).map((row) => text(row?.id)).filter(Boolean))];
  const itemCounts = new Map();
  if (!kitIds.length) return itemCounts;

  const pageSize = 500;
  const inList = postgrestInList(kitIds);
  for (let offset = 0; ; offset += pageSize) {
    const rows = await supabaseRequest(
      `/${encodeURIComponent(kitItemsTable())}?select=kit_id&kit_id=in.(${encodeURIComponent(inList)})&order=id.asc&limit=${pageSize}&offset=${offset}`,
      { profileName: "kits.count-items-fallback" },
    );
    const page = Array.isArray(rows) ? rows : [];
    for (const row of page) {
      const kitId = text(row?.kit_id);
      if (kitId) itemCounts.set(kitId, (itemCounts.get(kitId) || 0) + 1);
    }
    if (page.length < pageSize) break;
  }
  return itemCounts;
}

async function kitMembershipRowsForHeaders(headers = []) {
  const kitIds = [...new Set((headers || []).map((row) => text(row?.id)).filter(Boolean))];
  if (!kitIds.length) return [];

  const out = [];
  const pageSize = 500;
  const inList = postgrestInList(kitIds);
  for (let offset = 0; ; offset += pageSize) {
    const rows = await supabaseRequest(
      `/${encodeURIComponent(kitItemsTable())}?select=kit_id,product_id&kit_id=in.(${encodeURIComponent(inList)})&order=id.asc&limit=${pageSize}&offset=${offset}`,
      { profileName: "kits.membership-items" },
    );
    const page = Array.isArray(rows) ? rows : [];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

export async function listProposals(account, { fresh = false } = {}) {
  // `account` may be a promise. This lets page loaders start the safe Supabase
  // reads at the same time as the permission gate instead of serializing them.
  // Only raw shared rows/counts are cached; `canEdit` is calculated afterward.
  const accountPromise = Promise.resolve(account || {});
  const snapshot = await proposalKitCachedRead("proposals:list", async () => {
    if (canUseProposalHeadersRpc()) {
      try {
        const headers = await loadProposalHeadersRpc();
        return { headers, itemCounts: null, source: "rpc" };
      } catch (error) {
        // Only disable the accelerator when Supabase explicitly reports that
        // the optional function is not installed. Other failures still fall
        // through for this request without permanently hiding real problems.
        noteProposalHeadersRpcError(error);
      }
    }

    const headers = await proposalHeaderRowsCompact();
    const itemCounts = await proposalItemCountsForHeaders(headers);
    return { headers, itemCounts, source: "rest" };
  }, { fresh });
  const resolvedAccount = await accountPromise;
  return snapshot.headers.map((row) => proposalHeader(
    row,
    snapshot.itemCounts ? (snapshot.itemCounts.get(text(row.id)) || 0) : (Number(row.items_count) || 0),
    resolvedAccount,
  ));
}

export async function getProposal(id, account) {
  const row = await selectById(proposalTable(), id);
  if (!row) {
    const error = new Error("Proposal not found.");
    error.status = 404;
    throw error;
  }
  const items = await rowsByForeignKey(proposalItemsTable(), "proposal_id", id);
  return {
    proposal: proposalHeader(row, items.length, account),
    items: items.map(proposalItem),
  };
}

export async function createProposal(name, account) {
  const clean = text(name);
  if (!clean) {
    const error = new Error("Proposal name is required.");
    error.status = 400;
    throw error;
  }
  const identity = accountIdentity(account);
  const now = new Date().toISOString();
  const row = { name: clean, created_at: now, updated_at: now };
  if (identity.id) row.created_by_id = identity.id;
  if (identity.name) row.created_by = identity.name;
  const created = await insert(proposalTable(), row);
  invalidateProposalKitReadCaches("proposals");
  return proposalHeader(created || row, 0, account);
}

function postgrestInList(values = []) {
  return [...new Set((values || []).map((value) => text(value)).filter(Boolean))]
    .map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
}

async function productsForProposalItems(items = []) {
  const productIds = [...new Set((items || []).map((item) => text(item?.productId)).filter(Boolean))];
  if (!productIds.length) return new Map();
  const inList = postgrestInList(productIds);
  const rows = await supabaseRequest(
    `/${encodeURIComponent(getSupabaseConfig().productsTable)}?select=id,name&id=in.(${encodeURIComponent(inList)})`,
    { timeoutMs: 30000 },
  );
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [text(row.id), row]));
}

export async function createProposalWithItems(name, items, account) {
  const merged = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const productId = text(raw?.productId);
    if (!productId) continue;
    const quantity = positiveInt(raw?.quantity);
    const incomingSources = sourceKits(raw?.sourceKits || raw?.source_kits);
    const current = merged.get(productId);
    if (current) {
      current.sourceKits = mergeSourceKits(current.sourceKits, incomingSources, current.quantity, quantity, "add");
      current.quantity += quantity;
    } else merged.set(productId, { productId, quantity, sourceKits: incomingSources });
  }

  if (!merged.size) return await createProposal(name, account);

  const created = await createProposal(name, account);
  try {
    const cleanItems = [...merged.values()];
    const products = await productsForProposalItems(cleanItems);
    const missing = cleanItems.find((item) => !products.has(item.productId));
    if (missing) {
      const error = new Error(`Product not found: ${missing.productId}`);
      error.status = 404;
      throw error;
    }

    const now = new Date().toISOString();
    const rows = cleanItems.map((item) => {
      const product = products.get(item.productId) || {};
      return {
        proposal_id: created.id,
        product_id: item.productId,
        product_name: text(product.name) || "Untitled product",
        quantity: positiveInt(item.quantity),
        source_kits: sourceKits(item.sourceKits),
        created_at: now,
        updated_at: now,
      };
    });

    await supabaseRequest(`/${encodeURIComponent(proposalItemsTable())}`, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: rows,
      timeoutMs: 120000,
    });
    await updateById(proposalTable(), created.id, { updated_at: now });
    invalidateProposalKitReadCaches("proposals");
    return { ...created, itemsCount: rows.length, updatedAt: now };
  } catch (error) {
    try { await deleteRowsByForeignKey(proposalItemsTable(), "proposal_id", created.id); } catch {}
    try { await deleteById(proposalTable(), created.id); } catch {}
    throw error;
  }
}

export async function updateProposal(id, body, account) {
  const current = await selectById(proposalTable(), id);
  if (!current) {
    const error = new Error("Proposal not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(current, account, body?.adminPassword);
  const name = text(body?.name);
  if (!name) {
    const error = new Error("Proposal name is required.");
    error.status = 400;
    throw error;
  }
  const updated = await updateById(proposalTable(), id, { name, updated_at: new Date().toISOString() });
  invalidateProposalKitReadCaches("proposals");
  const suppliedCount = Number(body?.itemsCount);
  const itemCount = Number.isFinite(suppliedCount) && suppliedCount >= 0
    ? Math.round(suppliedCount)
    : (await rowsByForeignKey(proposalItemsTable(), "proposal_id", id)).length;
  return proposalHeader(updated || { ...current, name }, itemCount, account);
}

export async function deleteProposal(id, body, account) {
  const current = await selectById(proposalTable(), id);
  if (!current) return;
  await requireOwnerOrAdmin(current, account, body?.adminPassword);
  await deleteRowsByForeignKey(proposalItemsTable(), "proposal_id", id);
  await deleteById(proposalTable(), id);
  invalidateProposalKitReadCaches("proposals");
}

export async function copyProposal(id, name, account) {
  const source = await selectById(proposalTable(), id);
  if (!source) {
    const error = new Error("Proposal not found.");
    error.status = 404;
    throw error;
  }
  const created = await createProposal(name, account);
  const sourceItems = await rowsByForeignKey(proposalItemsTable(), "proposal_id", id);
  const now = new Date().toISOString();
  for (const item of sourceItems) {
    await insert(proposalItemsTable(), {
      proposal_id: created.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: positiveInt(item.quantity),
      source_kits: sourceKits(item.source_kits),
      created_at: now,
      updated_at: now,
    });
  }
  invalidateProposalKitReadCaches("proposals");
  return { ...created, itemsCount: sourceItems.length };
}

function mergedQuantity(current, incoming, logic = "add") {
  const a = positiveInt(current);
  const b = positiveInt(incoming);
  if (logic === "max") return Math.max(a, b);
  if (logic === "min") return Math.min(a, b);
  return a + b;
}

export async function addProposalProduct(proposalId, body, account) {
  const parent = await selectById(proposalTable(), proposalId);
  if (!parent) {
    const error = new Error("Proposal not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(parent, account, body?.adminPassword);
  const productId = text(body?.productId);
  const product = await selectById(getSupabaseConfig().productsTable, productId);
  if (!product) {
    const error = new Error("Product not found.");
    error.status = 404;
    throw error;
  }
  const items = await rowsByForeignKey(proposalItemsTable(), "proposal_id", proposalId);
  const existing = items.find((item) => text(item.product_id) === productId);
  const quantity = positiveInt(body?.quantity);
  const now = new Date().toISOString();
  if (existing) {
    const mergeLogic = text(body?.mergeLogic).toLowerCase();
    const directSource = [{ kitId: "", kitName: "Direct components", quantity, order: 0 }];
    await updateById(proposalItemsTable(), existing.id, {
      quantity: mergedQuantity(existing.quantity, quantity, mergeLogic),
      product_name: text(product.name) || text(existing.product_name),
      source_kits: mergeSourceKits(existing.source_kits, directSource, existing.quantity, quantity, mergeLogic),
      updated_at: now,
    });
  } else {
    await insert(proposalItemsTable(), {
      proposal_id: proposalId,
      product_id: productId,
      product_name: text(product.name) || "Untitled product",
      quantity,
      source_kits: [{ kitId: "", kitName: "Direct components", quantity, order: 0 }],
      created_at: now,
      updated_at: now,
    });
  }
  await updateById(proposalTable(), proposalId, { updated_at: now });
  invalidateProposalKitReadCaches("proposals");
  return await getProposal(proposalId, account);
}

export async function addProposalProductsByTag(proposalId, body = {}, account = {}) {
  const parent = await selectById(proposalTable(), proposalId);
  if (!parent) {
    const error = new Error("Proposal not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(parent, account, body?.adminPassword);

  const tag = text(body?.tag || body?.tags || body?.name);
  if (!tag) {
    const error = new Error("Tag is required.");
    error.status = 400;
    throw error;
  }
  const products = (await getProductsList({ fresh: true })).filter((product) => {
    const tags = Array.isArray(product?.tags)
      ? product.tags.map(text).filter(Boolean)
      : text(product?.tags).split(/[,;|]/).map(text).filter(Boolean);
    return (tags[0] || "") === tag;
  });
  if (!products.length) {
    const error = new Error("No products were found under this tag.");
    error.status = 404;
    throw error;
  }

  const quantity = positiveInt(body?.quantity || body?.qty);
  const mergeLogic = text(body?.mergeLogic || body?.logic || body?.quantityLogic).toLowerCase();
  const now = new Date().toISOString();
  const rows = await rowsByForeignKey(proposalItemsTable(), "proposal_id", proposalId);
  const byProduct = new Map(rows.map((row) => [text(row?.product_id), row]).filter(([id]) => id));

  for (const product of products) {
    const productId = text(product?.id);
    if (!productId) continue;
    const existing = byProduct.get(productId);
    const directSource = [{ kitId: "", kitName: "Direct components", quantity, order: 0 }];
    if (existing) {
      await updateById(proposalItemsTable(), existing.id, {
        quantity: mergedQuantity(existing.quantity, quantity, mergeLogic),
        product_name: text(product?.name) || text(existing?.product_name) || "Untitled product",
        source_kits: mergeSourceKits(existing.source_kits, directSource, existing.quantity, quantity, mergeLogic),
        updated_at: now,
      });
    } else {
      const created = await insert(proposalItemsTable(), {
        proposal_id: proposalId,
        product_id: productId,
        product_name: text(product?.name) || "Untitled product",
        quantity,
        source_kits: directSource,
        created_at: now,
        updated_at: now,
      });
      byProduct.set(productId, created || { product_id: productId, quantity, source_kits: directSource });
    }
  }

  await updateById(proposalTable(), proposalId, { updated_at: now });
  invalidateProposalKitReadCaches("proposals");
  return { ...(await getProposal(proposalId, account)), addedCount: products.length };
}

export async function updateProposalItem(proposalId, itemId, body, account) {
  const parent = await selectById(proposalTable(), proposalId);
  if (!parent) {
    const error = new Error("Proposal not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(parent, account, body?.adminPassword);
  const item = await selectById(proposalItemsTable(), itemId);
  if (!item || text(item.proposal_id) !== text(proposalId)) {
    const error = new Error("Proposal item not found.");
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  await updateById(proposalItemsTable(), itemId, { quantity: positiveInt(body?.quantity), updated_at: now });
  await updateById(proposalTable(), proposalId, { updated_at: now });
  invalidateProposalKitReadCaches("proposals");
  return await getProposal(proposalId, account);
}

export async function deleteProposalItem(proposalId, itemId, body, account) {
  const parent = await selectById(proposalTable(), proposalId);
  if (!parent) {
    const error = new Error("Proposal not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(parent, account, body?.adminPassword);
  const item = await selectById(proposalItemsTable(), itemId);
  if (!item || text(item.proposal_id) !== text(proposalId)) {
    const error = new Error("Proposal item not found.");
    error.status = 404;
    throw error;
  }
  await deleteById(proposalItemsTable(), itemId);
  await updateById(proposalTable(), proposalId, { updated_at: new Date().toISOString() });
  invalidateProposalKitReadCaches("proposals");
  return await getProposal(proposalId, account);
}

export async function listKitFolders(account, { fresh = false } = {}) {
  const [rows, resolvedAccount] = await Promise.all([
    proposalKitCachedRead(
      "kit-folders:list",
      () => selectAll(kitFoldersTable(), { limit: 5000, order: "updated_at.desc,created_at.desc" }),
      { fresh, ttlMs: 30_000 },
    ),
    Promise.resolve(account || {}),
  ]);
  return rows.map((row) => kitFolderHeader(row, resolvedAccount));
}

export async function createKitFolder(name, account) {
  const clean = text(name);
  if (!clean) {
    const error = new Error("Folder name is required.");
    error.status = 400;
    throw error;
  }
  const identity = accountIdentity(account);
  const now = new Date().toISOString();
  const row = { name: clean, created_at: now, updated_at: now };
  if (identity.id) row.created_by_id = identity.id;
  if (identity.name) row.created_by = identity.name;
  const created = await insert(kitFoldersTable(), row);
  invalidateProposalKitReadCaches("kit-folders");
  return kitFolderHeader(created || row, account);
}

export async function updateKitFolder(id, body, account) {
  const current = await selectById(kitFoldersTable(), id);
  if (!current) {
    const error = new Error("Kit folder not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(current, account, body?.adminPassword);
  const name = text(body?.name);
  if (!name) {
    const error = new Error("Folder name is required.");
    error.status = 400;
    throw error;
  }
  const updated = await updateById(kitFoldersTable(), id, { name, updated_at: new Date().toISOString() });
  invalidateProposalKitReadCaches("kit-folders");
  return kitFolderHeader(updated || { ...current, name }, account);
}

export async function deleteKitFolder(id, body, account) {
  const current = await selectById(kitFoldersTable(), id);
  if (!current) return;
  await requireOwnerOrAdmin(current, account, body?.adminPassword);
  await deleteById(kitFoldersTable(), id);
  invalidateProposalKitReadCaches("kit-folders", "kits");
}

async function kitListSnapshot({ fresh = false } = {}) {
  return await proposalKitCachedRead("kits:snapshot", async () => {
    const headers = await kitHeaderRowsCompact();
    const items = await kitMembershipRowsForHeaders(headers);
    return { headers, items };
  }, { fresh });
}

export async function listKits(account, { fresh = false } = {}) {
  const [headers, resolvedAccount] = await Promise.all([
    proposalKitCachedRead("kits:list", async () => {
      if (canUseKitHeadersRpc()) {
        try {
          return await loadKitHeadersRpc();
        } catch (error) {
          noteKitHeadersRpcError(error);
        }
      }

      // Compatibility fallback: keep the existing REST path, but fetch only
      // the two fields required to calculate counts rather than every item
      // property. This path is used until the optional RPC is installed.
      const headerRows = await kitHeaderRowsCompact();
      const itemCounts = await kitItemCountsForHeaders(headerRows);
      return headerRows.map((row) => ({ ...row, items_count: itemCounts.get(text(row.id)) || 0 }));
    }, { fresh }),
    Promise.resolve(account || {}),
  ]);

  return headers.map((row) => kitHeader(row, Number(row.items_count) || 0, resolvedAccount));
}

export async function listKitMembership({ fresh = false } = {}) {
  const { headers, items } = await kitListSnapshot({ fresh });
  const kitNames = new Map(headers.map((row) => [text(row.id), text(row.name) || "Untitled kit"]));
  const byProduct = new Map();
  for (const item of items || []) {
    const productId = text(item?.product_id);
    const kitId = text(item?.kit_id);
    const kitName = kitNames.get(kitId);
    if (!productId || !kitName) continue;
    if (!byProduct.has(productId)) byProduct.set(productId, new Map());
    byProduct.get(productId).set(kitId, kitName);
  }
  return [...byProduct.entries()].map(([productId, kitMap]) => ({
    productId,
    kits: [...kitMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export async function getKit(id, account) {
  const row = await selectById(kitsTable(), id);
  if (!row) {
    const error = new Error("Kit not found.");
    error.status = 404;
    throw error;
  }
  const items = await rowsByForeignKey(kitItemsTable(), "kit_id", id);
  return { kit: kitHeader(row, items.length, account), items: items.map(kitItem) };
}

export async function createKit(name, account, folderId = "") {
  const clean = text(name);
  if (!clean) {
    const error = new Error("Kit name is required.");
    error.status = 400;
    throw error;
  }
  const cleanFolderId = text(folderId);
  if (cleanFolderId) await requireKitFolder(cleanFolderId);
  const identity = accountIdentity(account);
  const now = new Date().toISOString();
  const row = { name: clean, created_at: now, updated_at: now };
  if (cleanFolderId) row.folder_id = cleanFolderId;
  if (identity.id) row.created_by_id = identity.id;
  if (identity.name) row.created_by = identity.name;
  const created = await insert(kitsTable(), row);
  invalidateProposalKitReadCaches("kits");
  return kitHeader(created || row, 0, account);
}

export async function updateKit(id, body, account) {
  const current = await selectById(kitsTable(), id);
  if (!current) {
    const error = new Error("Kit not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(current, account, body?.adminPassword);
  const hasName = Object.prototype.hasOwnProperty.call(body || {}, "name");
  const name = hasName ? text(body?.name) : text(current.name);
  if (!name) {
    const error = new Error("Kit name is required.");
    error.status = 400;
    throw error;
  }
  const patch = { name, updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body || {}, "folderId")) {
    const folderId = text(body?.folderId);
    if (folderId) await requireKitFolder(folderId);
    patch.folder_id = folderId || null;
  }
  const updated = await updateById(kitsTable(), id, patch);
  invalidateProposalKitReadCaches("kits");
  const items = await rowsByForeignKey(kitItemsTable(), "kit_id", id);
  return kitHeader(updated || { ...current, name }, items.length, account);
}

export async function deleteKit(id, body, account) {
  const current = await selectById(kitsTable(), id);
  if (!current) return;
  await requireOwnerOrAdmin(current, account, body?.adminPassword);
  await deleteRowsByForeignKey(kitItemsTable(), "kit_id", id);
  await deleteById(kitsTable(), id);
  invalidateProposalKitReadCaches("kits");
}

export async function copyKit(id, name, account) {
  const source = await selectById(kitsTable(), id);
  if (!source) {
    const error = new Error("Kit not found.");
    error.status = 404;
    throw error;
  }
  const created = await createKit(name, account, text(source.folder_id));
  const sourceItems = await rowsByForeignKey(kitItemsTable(), "kit_id", id);
  const now = new Date().toISOString();
  for (const item of sourceItems) {
    await insert(kitItemsTable(), {
      kit_id: created.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: positiveInt(item.quantity),
      created_at: now,
      updated_at: now,
    });
  }
  invalidateProposalKitReadCaches("kits");
  return { ...created, itemsCount: sourceItems.length };
}

export async function addKitProduct(kitId, body, account) {
  const parent = await selectById(kitsTable(), kitId);
  if (!parent) {
    const error = new Error("Kit not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(parent, account, body?.adminPassword);
  const productId = text(body?.productId);
  const product = await selectById(getSupabaseConfig().productsTable, productId);
  if (!product) {
    const error = new Error("Product not found.");
    error.status = 404;
    throw error;
  }
  const items = await rowsByForeignKey(kitItemsTable(), "kit_id", kitId);
  const existing = items.find((item) => text(item.product_id) === productId);
  const quantity = positiveInt(body?.quantity);
  const now = new Date().toISOString();
  if (existing) {
    await updateById(kitItemsTable(), existing.id, {
      quantity: positiveInt(existing.quantity) + quantity,
      product_name: text(product.name) || text(existing.product_name),
      updated_at: now,
    });
  } else {
    await insert(kitItemsTable(), {
      kit_id: kitId,
      product_id: productId,
      product_name: text(product.name) || "Untitled product",
      quantity,
      created_at: now,
      updated_at: now,
    });
  }
  await updateById(kitsTable(), kitId, { updated_at: now });
  invalidateProposalKitReadCaches("kits");
  return await getKit(kitId, account);
}

export async function updateKitItem(kitId, itemId, body, account) {
  const parent = await selectById(kitsTable(), kitId);
  if (!parent) {
    const error = new Error("Kit not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(parent, account, body?.adminPassword);
  const item = await selectById(kitItemsTable(), itemId);
  if (!item || text(item.kit_id) !== text(kitId)) {
    const error = new Error("Kit item not found.");
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  await updateById(kitItemsTable(), itemId, { quantity: positiveInt(body?.quantity), updated_at: now });
  await updateById(kitsTable(), kitId, { updated_at: now });
  invalidateProposalKitReadCaches("kits");
  return await getKit(kitId, account);
}

export async function deleteKitItem(kitId, itemId, body, account) {
  const parent = await selectById(kitsTable(), kitId);
  if (!parent) {
    const error = new Error("Kit not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(parent, account, body?.adminPassword);
  const item = await selectById(kitItemsTable(), itemId);
  if (!item || text(item.kit_id) !== text(kitId)) {
    const error = new Error("Kit item not found.");
    error.status = 404;
    throw error;
  }
  await deleteById(kitItemsTable(), itemId);
  await updateById(kitsTable(), kitId, { updated_at: new Date().toISOString() });
  invalidateProposalKitReadCaches("kits");
  return await getKit(kitId, account);
}


function normalizedCombineLogic(value) {
  const raw = text(value).toLowerCase().replace(/[\s_-]+/g, "-");
  if (["max", "max-logic"].includes(raw)) return "max";
  if (["min", "min-logic"].includes(raw)) return "min";
  if (["separate", "separate-logic"].includes(raw)) return "separate";
  return "add";
}

function proposalIds(value) {
  const raw = Array.isArray(value) ? value : text(value).split(",");
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const id = text(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sourceKitsForTotal(value, totalQuantity) {
  const target = positiveInt(totalQuantity);
  const sources = sourceKits(value);
  if (!sources.length) return [{ kitId: "", kitName: "Direct / legacy components", quantity: target, order: 0 }];
  const currentTotal = sources.reduce((sum, source) => sum + positiveInt(source?.quantity), 0);
  if (currentTotal === target) return sources;
  if (sources.length === 1) return [{ ...sources[0], quantity: target }];

  const scaled = sources.map((source, index) => {
    const raw = (positiveInt(source?.quantity) * target) / Math.max(1, currentTotal);
    const base = Math.floor(raw);
    return { ...source, quantity: base, _fraction: raw - base, _index: index };
  });
  let assigned = scaled.reduce((sum, source) => sum + Number(source.quantity || 0), 0);
  let remaining = target - assigned;
  const byFraction = scaled.slice().sort((a, b) => (b._fraction - a._fraction) || (a._index - b._index));
  for (let i = 0; remaining > 0 && byFraction.length; i = (i + 1) % byFraction.length) {
    byFraction[i].quantity += 1;
    remaining -= 1;
  }
  return scaled
    .filter((source) => Number(source.quantity || 0) > 0)
    .map(({ _fraction, _index, ...source }) => source);
}

function primarySourceKit(value) {
  const sources = sourceKits(value);
  if (!sources.length) return null;
  return sources.slice().sort((a, b) => (Number(b.quantity || 0) - Number(a.quantity || 0)) || (Number(a.order || 0) - Number(b.order || 0)))[0] || null;
}

async function proposalProductMap({ fresh = true } = {}) {
  const products = await getProductsList({ fresh });
  return new Map((products || []).map((product) => [text(product?.id), product]).filter(([id]) => Boolean(id)));
}

export async function addProposalKit(proposalId, body = {}, account = {}) {
  const parent = await selectById(proposalTable(), proposalId);
  if (!parent) {
    const error = new Error("Proposal not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(parent, account, body?.adminPassword);

  const kitId = text(body?.kitId || body?.kit_id || body?.id);
  if (!kitId) {
    const error = new Error("Kit is required.");
    error.status = 400;
    throw error;
  }
  const detail = await getKit(kitId, account);
  const kit = detail?.kit;
  const kitItems = Array.isArray(detail?.items) ? detail.items : [];
  if (!kitItems.length) {
    const error = new Error("This kit has no components yet.");
    error.status = 400;
    throw error;
  }

  const multiplier = positiveInt(body?.quantity ?? body?.qty ?? body?.kitQuantity ?? body?.kit_quantity ?? 1);
  const mergeLogic = text(body?.mergeLogic || body?.logic || body?.quantityLogic).toLowerCase();
  const [products, currentRows] = await Promise.all([
    proposalProductMap({ fresh: true }),
    rowsByForeignKey(proposalItemsTable(), "proposal_id", proposalId),
  ]);
  const byProduct = new Map((currentRows || []).map((row) => [text(row?.product_id), row]).filter(([id]) => Boolean(id)));
  const now = new Date().toISOString();
  let addedCount = 0;

  for (const item of kitItems) {
    const productId = text(item?.productId);
    const product = products.get(productId) || { id: productId, name: text(item?.productName) };
    if (!productId) continue;
    const sourceQuantity = positiveInt(item?.quantity) * multiplier;
    const incomingSources = [{ kitId, kitName: text(kit?.name) || "Untitled kit", quantity: sourceQuantity, order: 0 }];
    const existing = byProduct.get(productId);
    if (existing) {
      const updatedQuantity = mergedQuantity(existing.quantity, sourceQuantity, mergeLogic);
      const updatedSources = mergeSourceKits(existing.source_kits, incomingSources, existing.quantity, sourceQuantity, mergeLogic);
      const updated = await updateById(proposalItemsTable(), existing.id, {
        quantity: updatedQuantity,
        product_name: text(product?.name) || text(existing.product_name) || "Untitled product",
        source_kits: updatedSources,
        updated_at: now,
      });
      byProduct.set(productId, updated || { ...existing, quantity: updatedQuantity, source_kits: updatedSources, updated_at: now });
    } else {
      const created = await insert(proposalItemsTable(), {
        proposal_id: proposalId,
        product_id: productId,
        product_name: text(product?.name) || text(item?.productName) || "Untitled product",
        quantity: sourceQuantity,
        source_kits: incomingSources,
        created_at: now,
        updated_at: now,
      });
      byProduct.set(productId, created || {
        proposal_id: proposalId,
        product_id: productId,
        product_name: text(product?.name) || text(item?.productName) || "Untitled product",
        quantity: sourceQuantity,
        source_kits: incomingSources,
        created_at: now,
        updated_at: now,
      });
    }
    addedCount += 1;
  }

  await updateById(proposalTable(), proposalId, { updated_at: now });
  invalidateProposalKitReadCaches("proposals");
  return { ...(await getProposal(proposalId, account)), addedCount, kit };
}

function combinedSourceKitsForRow({ sources = [], sourceQuantities = {}, sourceKitQuantities = {}, combinedQuantity = 1, logic = "add" } = {}) {
  const cleanLogic = normalizedCombineLogic(logic);
  if (cleanLogic === "max" || cleanLogic === "min") {
    const candidates = (sources || [])
      .map((source, index) => ({ source, index, quantity: Number(sourceQuantities[source.id]) || 0 }))
      .filter((entry) => entry.quantity > 0)
      .sort((a, b) => cleanLogic === "max"
        ? (b.quantity - a.quantity) || (a.index - b.index)
        : (a.quantity - b.quantity) || (a.index - b.index));
    const winnerId = candidates[0]?.source?.id;
    return winnerId ? sourceKits(sourceKitQuantities[winnerId]) : [];
  }

  const tracked = (sources || [])
    .map((source, index) => ({ source, index, kits: sourceKits(sourceKitQuantities[source.id] || []) }))
    .filter((entry) => Number(sourceQuantities[entry.source.id]) > 0);
  const hasMultiKitSplit = tracked.some((entry) => entry.kits.length > 1);
  if (!hasMultiKitSplit && tracked.length) {
    const candidates = new Map();
    for (const entry of tracked) {
      const kit = entry.kits[0];
      if (!kit) continue;
      const key = text(kit.kitId) || `name:${text(kit.kitName).toLowerCase()}`;
      if (!candidates.has(key)) candidates.set(key, { kit, count: 0, quantity: 0, firstIndex: entry.index });
      const candidate = candidates.get(key);
      candidate.count += 1;
      candidate.quantity += Number(sourceQuantities[entry.source.id]) || 0;
      candidate.firstIndex = Math.min(candidate.firstIndex, entry.index);
    }
    const canonicalKit = [...candidates.values()].sort((a, b) =>
      (b.count - a.count) || (b.quantity - a.quantity) || (a.firstIndex - b.firstIndex) || (Number(a.kit?.order || 0) - Number(b.kit?.order || 0))
    )[0]?.kit;
    if (canonicalKit) return [{ ...canonicalKit, quantity: positiveInt(combinedQuantity) }];
  }

  let effective = [];
  for (const source of sources || []) {
    const incoming = sourceKitQuantities[source.id] || [];
    const currentTotal = effective.reduce((sum, kit) => sum + (Number(kit.quantity) || 0), 0) || 1;
    effective = mergeSourceKits(effective, incoming, currentTotal, Number(sourceQuantities[source.id]) || 1, "add");
  }
  return effective;
}

async function combinedProposalData(ids = [], logic = "add", account = {}) {
  const cleanIds = proposalIds(ids);
  if (cleanIds.length < 2) {
    const error = new Error("Please select at least two proposals to combine.");
    error.status = 400;
    throw error;
  }
  const details = [];
  for (const id of cleanIds) details.push(await getProposal(id, account));
  const products = await proposalProductMap({ fresh: true });
  const sources = details.map((detail) => ({ id: text(detail?.proposal?.id), name: text(detail?.proposal?.name) || "Proposal" }));
  const rowsMap = new Map();

  for (const detail of details) {
    const sourceId = text(detail?.proposal?.id);
    for (const item of detail?.items || []) {
      const productId = text(item?.productId);
      const product = products.get(productId) || {};
      const name = text(product?.name) || text(item?.productName) || "Untitled Product";
      const key = productId ? `id:${productId}` : `name:${name.toLowerCase()}`;
      const quantity = positiveInt(item?.quantity);
      if (!rowsMap.has(key)) {
        rowsMap.set(key, {
          productId: productId || null,
          productName: name,
          tag: Array.isArray(product?.tags) ? (product.tags.map(text).find(Boolean) || "") : "",
          sourceQuantities: {},
          sourceKitQuantities: {},
          quantity: 0,
        });
      }
      const row = rowsMap.get(key);
      const existingSourceQuantity = Number(row.sourceQuantities[sourceId]) || 0;
      const itemSources = sourceKitsForTotal(item?.sourceKits || item?.source_kits || [], quantity);
      row.sourceQuantities[sourceId] = existingSourceQuantity + quantity;
      row.sourceKitQuantities[sourceId] = mergeSourceKits(
        row.sourceKitQuantities[sourceId] || [],
        itemSources,
        existingSourceQuantity || 1,
        quantity,
        "add",
      );
      row.quantity += quantity;
    }
  }

  const cleanLogic = normalizedCombineLogic(logic);
  const rows = [...rowsMap.values()].map((row) => {
    const sourceQuantities = sources.reduce((acc, source) => {
      acc[source.id] = Number(row.sourceQuantities[source.id]) || 0;
      return acc;
    }, {});
    const quantities = sources.map((source) => Number(sourceQuantities[source.id]) || 0);
    const present = quantities.filter((value) => value > 0);
    let combinedQuantity = quantities.reduce((sum, value) => sum + value, 0);
    if (cleanLogic === "max") combinedQuantity = present.length ? Math.max(...present) : 0;
    else if (cleanLogic === "min") combinedQuantity = present.length ? Math.min(...present) : 0;
    const sourceKitQuantities = sources.reduce((acc, source) => {
      const sourceQuantity = Number(sourceQuantities[source.id]) || 0;
      acc[source.id] = sourceQuantity > 0 ? sourceKitsForTotal(row.sourceKitQuantities[source.id] || [], sourceQuantity) : [];
      return acc;
    }, {});
    return {
      ...row,
      quantity: Math.max(1, Math.round(combinedQuantity || 1)),
      sourceQuantities,
      sourceKitQuantities,
      sourceKits: combinedSourceKitsForRow({ sources, sourceQuantities, sourceKitQuantities, combinedQuantity, logic: cleanLogic }),
    };
  }).sort((a, b) => text(a.productName).localeCompare(text(b.productName), undefined, { numeric: true, sensitivity: "base" }));

  const matrix = rows.map((row) => ({
    productId: row.productId,
    name: row.productName,
    tag: row.tag || "",
    quantity: row.quantity,
    sourceQuantities: row.sourceQuantities,
    sourceKitQuantities: row.sourceKitQuantities,
  }));
  const sourceText = sources.map((source) => source.name || source.id).filter(Boolean).join(", ") || "selected proposals";
  const logicLabel = cleanLogic === "max" ? "Max logic" : cleanLogic === "min" ? "Min logic" : cleanLogic === "separate" ? "Separate logic" : "Add logic";
  return {
    sources,
    rows,
    combinedMeta: {
      sources,
      logic: cleanLogic,
      note: `This proposal combines ${sourceText} using ${logicLabel}.`,
      matrix,
    },
  };
}

async function attachCombinedProposalMeta(proposalId, meta = {}) {
  const patch = {
    combined_sources: Array.isArray(meta?.sources) ? meta.sources : [],
    combine_logic: normalizedCombineLogic(meta?.logic),
    combine_note: text(meta?.note) || null,
    combined_matrix: Array.isArray(meta?.matrix) ? meta.matrix : [],
    updated_at: new Date().toISOString(),
  };
  try {
    await updateById(proposalTable(), proposalId, patch);
  } catch (error) {
    const message = [error?.message, error?.details?.message, error?.details?.details, error?.details?.hint]
      .filter(Boolean).join(" ").toLowerCase();
    if (!/combined_sources|combine_logic|combine_note|combined_matrix|column/.test(message)) throw error;
  }
}

export async function saveCombinedProposal(body = {}, account = {}) {
  const name = text(body?.name || body?.proposalName || body?.title);
  if (!name) {
    const error = new Error("Proposal name is required.");
    error.status = 400;
    throw error;
  }
  const data = await combinedProposalData(body?.proposalIds || body?.proposal_ids || body?.ids, body?.combineLogic || body?.logic || body?.combine_logic, account);
  const usableRows = data.rows.filter((row) => text(row?.productId));
  const proposal = await createProposalWithItems(name, usableRows.map((row) => ({
    productId: row.productId,
    quantity: row.quantity,
    sourceKits: row.sourceKits,
  })), account);
  if (proposal?.id) await attachCombinedProposalMeta(proposal.id, data.combinedMeta);
  const detail = proposal?.id ? await getProposal(proposal.id, account) : { proposal, items: [] };
  return { proposal: detail?.proposal || proposal, items: detail?.items || [], combinedMeta: data.combinedMeta };
}

function receiptUploads(body = {}) {
  return (Array.isArray(body?.receipts) ? body.receipts : [])
    .map((item, index) => ({
      url: text(item?.url),
      name: text(item?.name || item?.filename) || `Receipt ${index + 1}`,
    }))
    .filter((item) => /^https?:\/\//i.test(item.url));
}

function stockEntriesForDetail(detail = {}, products = new Map(), { kind = "proposal" } = {}) {
  const parent = kind === "kit" ? detail?.kit : detail?.proposal;
  const parentId = text(parent?.id);
  const parentName = text(parent?.name) || (kind === "kit" ? "Kit" : "Proposal");
  const out = [];
  for (const item of Array.isArray(detail?.items) ? detail.items : []) {
    const product = products.get(text(item?.productId)) || {};
    const totalQuantity = positiveInt(item?.quantity);
    const splitSources = kind === "kit"
      ? [{ kitId: parentId, kitName: parentName, quantity: totalQuantity, order: 0 }]
      : sourceKitsForTotal(item?.sourceKits || item?.source_kits || [], totalQuantity);
    for (const source of splitSources) {
      out.push({
        productId: text(item?.productId),
        productName: text(product?.name) || text(item?.productName) || "Untitled Product",
        productUrl: text(product?.url) || null,
        displayId: text(product?.displayId) || null,
        unitPrice: Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : null,
        quantity: positiveInt(source?.quantity),
        tag: text(source?.kitName) || "Direct / legacy components",
        sourceProposalId: kind === "proposal" ? parentId : null,
        sourceProposalName: kind === "proposal" ? parentName : null,
        sourceKitId: kind === "kit" ? parentId : null,
        sourceKitName: kind === "kit" ? parentName : null,
      });
    }
  }
  return out;
}

export async function sendProposalToStock(proposalId, body = {}, account = {}) {
  const detail = await getProposal(proposalId, account);
  if (!(detail?.items || []).length) {
    const error = new Error("This proposal has no components to send to Stocktaking.");
    error.status = 400;
    throw error;
  }
  const products = await proposalProductMap({ fresh: true });
  return await sendProductEntriesToStocktaking({
    memberId: body?.teamMemberId || body?.team_member_id,
    grantedBy: accountIdentity(account).name,
    receiptNumber: body?.receiptNumber || body?.receipt_number,
    receipts: receiptUploads(body),
    entries: stockEntriesForDetail(detail, products, { kind: "proposal" }),
  });
}

export async function sendKitToStock(kitId, body = {}, account = {}) {
  const detail = await getKit(kitId, account);
  if (!(detail?.items || []).length) {
    const error = new Error("This kit has no components to send to Stocktaking.");
    error.status = 400;
    throw error;
  }
  const products = await proposalProductMap({ fresh: true });
  return await sendProductEntriesToStocktaking({
    memberId: body?.teamMemberId || body?.team_member_id,
    grantedBy: accountIdentity(account).name,
    receiptNumber: body?.receiptNumber || body?.receipt_number,
    receipts: receiptUploads(body),
    entries: stockEntriesForDetail(detail, products, { kind: "kit" }),
  });
}

export const __proposalKitActionTest = {
  normalizedCombineLogic,
  proposalIds,
  sourceKitsForTotal,
  primarySourceKit,
};
