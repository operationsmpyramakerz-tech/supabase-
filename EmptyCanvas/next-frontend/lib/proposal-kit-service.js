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
