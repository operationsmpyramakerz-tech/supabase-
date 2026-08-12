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
import { fetchLegacyJson } from "./legacy-api";

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
  const createdName = text(row.created_by_name);
  if (createdId && identity.id) return createdId === identity.id;
  if (createdName && identity.name) return createdName.toLowerCase() === identity.name.toLowerCase();
  return false;
}

async function verifyAdmin(password) {
  const clean = text(password);
  if (!clean) return false;
  const response = await fetchLegacyJson("/api/products/admin/verify", {
    method: "POST",
    body: { password: clean },
    timeoutMs: 15000,
  });
  return !!(response.ok && response.data?.ok !== false);
}

async function requireOwnerOrAdmin(row, account, adminPassword) {
  if (isOwner(row, account)) return;
  if (await verifyAdmin(adminPassword)) return;
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
    unitPrice: row.unit_price == null ? null : number(row.unit_price),
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
    createdBy: text(row.created_by_name),
    createdById: text(row.created_by_id),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    itemsCount: Number(itemCount) || 0,
    canEdit: isOwner(row, account),
    combinedSources: Array.isArray(row.combined_sources) ? row.combined_sources : [],
    combinedSourceNames: Array.isArray(row.combined_source_names) ? row.combined_source_names : [],
    source: "supabase-next",
  };
}

function kitHeader(row = {}, itemCount = 0, account = {}) {
  return {
    id: text(row.id),
    name: text(row.name) || "Untitled kit",
    createdBy: text(row.created_by_name),
    createdById: text(row.created_by_id),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    itemsCount: Number(itemCount) || 0,
    canEdit: isOwner(row, account),
    source: "supabase-next",
  };
}

function counts(rows, foreignKey) {
  const map = new Map();
  for (const row of rows || []) {
    const id = text(row?.[foreignKey]);
    if (id) map.set(id, (map.get(id) || 0) + 1);
  }
  return map;
}

async function activeKitRows() {
  const rows = await supabaseRequest(
    `/${encodeURIComponent(kitsTable())}?select=*&deleted_at=is.null&order=updated_at.desc,created_at.desc`,
  );
  return Array.isArray(rows) ? rows : [];
}

export async function listProposals(account) {
  const [headers, items] = await Promise.all([
    selectAll(proposalTable(), { limit: 5000, order: "updated_at.desc,created_at.desc" }),
    selectAll(proposalItemsTable(), { limit: 5000, order: "created_at.asc" }),
  ]);
  const itemCounts = counts(items, "proposal_id");
  return headers.map((row) => proposalHeader(row, itemCounts.get(text(row.id)) || 0, account));
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
  if (identity.name) row.created_by_name = identity.name;
  const created = await insert(proposalTable(), row);
  return proposalHeader(created || row, 0, account);
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
  const items = await rowsByForeignKey(proposalItemsTable(), "proposal_id", id);
  return proposalHeader(updated || { ...current, name }, items.length, account);
}

export async function deleteProposal(id, body, account) {
  const current = await selectById(proposalTable(), id);
  if (!current) return;
  await requireOwnerOrAdmin(current, account, body?.adminPassword);
  await deleteRowsByForeignKey(proposalItemsTable(), "proposal_id", id);
  await deleteById(proposalTable(), id);
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
      unit_price: item.unit_price == null ? null : number(item.unit_price),
      created_at: now,
      updated_at: now,
    });
  }
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
    await updateById(proposalItemsTable(), existing.id, {
      quantity: mergedQuantity(existing.quantity, quantity, text(body?.mergeLogic).toLowerCase()),
      product_name: text(product.name) || text(existing.product_name),
      unit_price: product.unit_price == null ? existing.unit_price : number(product.unit_price),
      updated_at: now,
    });
  } else {
    await insert(proposalItemsTable(), {
      proposal_id: proposalId,
      product_id: productId,
      product_name: text(product.name) || "Untitled product",
      quantity,
      unit_price: product.unit_price == null ? null : number(product.unit_price),
      created_at: now,
      updated_at: now,
    });
  }
  await updateById(proposalTable(), proposalId, { updated_at: now });
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
  return await getProposal(proposalId, account);
}

export async function listKits(account) {
  const [headers, items] = await Promise.all([
    activeKitRows(),
    selectAll(kitItemsTable(), { limit: 5000, order: "created_at.asc" }),
  ]);
  const itemCounts = counts(items, "kit_id");
  return headers.map((row) => kitHeader(row, itemCounts.get(text(row.id)) || 0, account));
}

export async function getKit(id, account) {
  const row = await selectById(kitsTable(), id);
  if (!row || row.deleted_at) {
    const error = new Error("Kit not found.");
    error.status = 404;
    throw error;
  }
  const items = await rowsByForeignKey(kitItemsTable(), "kit_id", id);
  return { kit: kitHeader(row, items.length, account), items: items.map(kitItem) };
}

export async function createKit(name, account) {
  const clean = text(name);
  if (!clean) {
    const error = new Error("Kit name is required.");
    error.status = 400;
    throw error;
  }
  const identity = accountIdentity(account);
  const now = new Date().toISOString();
  const row = { name: clean, created_at: now, updated_at: now };
  if (identity.id) row.created_by_id = identity.id;
  if (identity.name) row.created_by_name = identity.name;
  const created = await insert(kitsTable(), row);
  return kitHeader(created || row, 0, account);
}

export async function updateKit(id, body, account) {
  const current = await selectById(kitsTable(), id);
  if (!current || current.deleted_at) {
    const error = new Error("Kit not found.");
    error.status = 404;
    throw error;
  }
  await requireOwnerOrAdmin(current, account, body?.adminPassword);
  const name = text(body?.name);
  if (!name) {
    const error = new Error("Kit name is required.");
    error.status = 400;
    throw error;
  }
  const updated = await updateById(kitsTable(), id, { name, updated_at: new Date().toISOString() });
  const items = await rowsByForeignKey(kitItemsTable(), "kit_id", id);
  return kitHeader(updated || { ...current, name }, items.length, account);
}

export async function deleteKit(id, body, account) {
  const current = await selectById(kitsTable(), id);
  if (!current || current.deleted_at) return;
  await requireOwnerOrAdmin(current, account, body?.adminPassword);
  const identity = accountIdentity(account);
  const patch = { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (identity.id) patch.deleted_by_id = identity.id;
  if (identity.name) patch.deleted_by_name = identity.name;
  await updateById(kitsTable(), id, patch);
}

export async function copyKit(id, name, account) {
  const source = await selectById(kitsTable(), id);
  if (!source || source.deleted_at) {
    const error = new Error("Kit not found.");
    error.status = 404;
    throw error;
  }
  const created = await createKit(name, account);
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
  return { ...created, itemsCount: sourceItems.length };
}

export async function addKitProduct(kitId, body, account) {
  const parent = await selectById(kitsTable(), kitId);
  if (!parent || parent.deleted_at) {
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
  return await getKit(kitId, account);
}

export async function updateKitItem(kitId, itemId, body, account) {
  const parent = await selectById(kitsTable(), kitId);
  if (!parent || parent.deleted_at) {
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
  return await getKit(kitId, account);
}

export async function deleteKitItem(kitId, itemId, body, account) {
  const parent = await selectById(kitsTable(), kitId);
  if (!parent || parent.deleted_at) {
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
  return await getKit(kitId, account);
}
