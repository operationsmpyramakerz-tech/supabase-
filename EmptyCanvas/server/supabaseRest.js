// server/supabaseRest.js
// Lightweight Supabase REST helper for Vercel/Express backend.
// Keeps the Service Role / Secret key server-only and avoids adding a new dependency.

function cleanBaseUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1\/?$/i, '');
}

function getConfig() {
  const url = cleanBaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  const teamMembersTable = String(process.env.SUPABASE_TEAM_MEMBERS_TABLE || 'team_members').trim() || 'team_members';
  const ordersTable = String(process.env.SUPABASE_ORDERS_TABLE || 'orders').trim() || 'orders';
  const expensesTable = String(process.env.SUPABASE_EXPENSES_TABLE || 'expenses').trim() || 'expenses';
  const productsTable = String(process.env.SUPABASE_PRODUCTS_TABLE || 'products').trim() || 'products';
  const stocktakingTable = String(process.env.SUPABASE_STOCKTAKING_TABLE || 'stocktaking').trim() || 'stocktaking';
  const b2bSchoolsTable = String(process.env.SUPABASE_B2B_SCHOOLS_TABLE || 'b2b_schools').trim() || 'b2b_schools';
  const tasksTable = String(process.env.SUPABASE_TASKS_TABLE || 'tasks').trim() || 'tasks';
  const storageBucket = String(process.env.SUPABASE_STORAGE_BUCKET || process.env.SUPABASE_BUCKET || 'operations-files').trim() || 'operations-files';
  return { url, key, teamMembersTable, ordersTable, expensesTable, productsTable, stocktakingTable, b2bSchoolsTable, tasksTable, storageBucket };
}

function isConfigured() {
  const { url, key } = getConfig();
  return /^https:\/\//i.test(url) && !!key;
}

function encodeTableName(table) {
  return encodeURIComponent(String(table || '').trim());
}

function encodeFilterValue(value) {
  return encodeURIComponent(String(value ?? ''));
}

async function request(path, options = {}) {
  const { url, key } = getConfig();
  if (!isConfigured()) {
    const err = new Error('Supabase is not configured. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    err.code = 'SUPABASE_NOT_CONFIGURED';
    throw err;
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...options.headers,
  };

  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${url}/rest/v1${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const message = data && typeof data === 'object'
      ? (data.message || data.details || data.hint || JSON.stringify(data))
      : (text || `Supabase request failed with status ${res.status}`);
    const err = new Error(message);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return data;
}

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || typeof value === 'undefined' || value === '') continue;
    qs.set(key, String(value));
  }
  const out = qs.toString();
  return out ? `?${out}` : '';
}

async function select(table, params = {}) {
  return await request(`/${encodeTableName(table)}${buildQuery(params)}`);
}

async function selectAll(table, { limit = 1000, order = null, select: selectExpr = '*' } = {}) {
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 1000));
  const params = { select: selectExpr, limit: safeLimit };
  if (order) params.order = order;
  return await select(table, params);
}

async function selectById(table, id) {
  const rows = await request(`/${encodeTableName(table)}?select=*&id=eq.${encodeFilterValue(id)}&limit=1`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insert(table, row) {
  const rows = await request(`/${encodeTableName(table)}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: row,
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function updateById(table, id, row) {
  const rows = await request(`/${encodeTableName(table)}?id=eq.${encodeFilterValue(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: row,
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function updateByIds(table, ids = [], row = {}) {
  const clean = (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (!clean.length) return [];
  const inList = clean.map((id) => `"${String(id).replace(/"/g, '\"')}"`).join(',');
  const rows = await request(`/${encodeTableName(table)}?id=in.(${encodeURIComponent(inList)})`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: row,
  });
  return Array.isArray(rows) ? rows : [];
}

async function deleteById(table, id) {
  const rows = await request(`/${encodeTableName(table)}?id=eq.${encodeFilterValue(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function deleteByIds(table, ids = []) {
  const clean = (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (!clean.length) return [];
  const inList = clean.map((id) => `"${String(id).replace(/"/g, '\"')}"`).join(',');
  const rows = await request(`/${encodeTableName(table)}?id=in.(${encodeURIComponent(inList)})`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(rows) ? rows : [];
}

function encodeStoragePath(objectPath) {
  return String(objectPath || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function storagePublicUrl(objectPath, bucketName = null) {
  const { url, storageBucket } = getConfig();
  const bucket = String(bucketName || storageBucket || '').trim();
  const key = String(objectPath || '').replace(/^\/+/, '');
  if (!/^https:\/\//i.test(url) || !bucket || !key) return '';
  return `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(key)}`;
}

async function uploadStorageObject(objectPath, buffer, { contentType = 'application/octet-stream', bucketName = null, upsert = true } = {}) {
  const { url, key, storageBucket } = getConfig();
  const bucket = String(bucketName || storageBucket || '').trim();
  const cleanPath = String(objectPath || '').replace(/^\/+/, '');
  if (!isConfigured() || !bucket) {
    const err = new Error('Supabase Storage is not configured. Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_STORAGE_BUCKET.');
    err.code = 'SUPABASE_STORAGE_NOT_CONFIGURED';
    throw err;
  }
  if (!cleanPath) {
    const err = new Error('Storage object path is required.');
    err.code = 'SUPABASE_STORAGE_PATH_REQUIRED';
    throw err;
  }

  const res = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(cleanPath)}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': upsert ? 'true' : 'false',
    },
    body: buffer,
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const message = data && typeof data === 'object'
      ? (data.message || data.error || JSON.stringify(data))
      : (text || `Supabase Storage upload failed with status ${res.status}`);
    const err = new Error(message);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return {
    path: cleanPath,
    bucket,
    data,
    publicUrl: storagePublicUrl(cleanPath, bucket),
  };
}

async function deleteStorageObjects(objectPaths = [], { bucketName = null } = {}) {
  const { url, key, storageBucket } = getConfig();
  const bucket = String(bucketName || storageBucket || '').trim();
  const prefixes = (Array.isArray(objectPaths) ? objectPaths : [objectPaths])
    .map((path) => String(path || '').replace(/^\/+/, '').trim())
    .filter(Boolean);
  if (!prefixes.length) return { deleted: 0, data: null };
  if (!isConfigured() || !bucket) {
    const err = new Error('Supabase Storage is not configured. Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_STORAGE_BUCKET.');
    err.code = 'SUPABASE_STORAGE_NOT_CONFIGURED';
    throw err;
  }

  const res = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes }),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const message = data && typeof data === 'object'
      ? (data.message || data.error || JSON.stringify(data))
      : (text || `Supabase Storage delete failed with status ${res.status}`);
    const err = new Error(message);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return { deleted: prefixes.length, data };
}

module.exports = { getConfig, isConfigured, request, select, selectAll, selectById, insert, updateById, updateByIds, deleteById, deleteByIds, uploadStorageObject, deleteStorageObjects, storagePublicUrl };
