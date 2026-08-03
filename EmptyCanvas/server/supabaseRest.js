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
  const storageBucket = String(process.env.SUPABASE_STORAGE_BUCKET || process.env.SUPABASE_BUCKET || 'operations-files').trim() || 'operations-files';
  return { url, key, teamMembersTable, ordersTable, expensesTable, productsTable, stocktakingTable, b2bSchoolsTable, storageBucket };
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

  const configuredTimeout = Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS || 15000);
  const timeoutMs = Math.max(1000, Math.min(120000, Number(options.timeoutMs || configuredTimeout) || 15000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(`${url}/rest/v1${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal || controller.signal,
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

    const slowMs = Math.max(250, Number(process.env.SUPABASE_SLOW_QUERY_MS || 1200) || 1200);
    const elapsed = Date.now() - startedAt;
    if (elapsed >= slowMs && String(process.env.SUPABASE_LOG_SLOW_QUERIES || 'true').toLowerCase() !== 'false') {
      const safePath = String(path || '').replace(/([?&](?:password|token|apikey|authorization)=)[^&]*/gi, '$1[redacted]');
      console.warn(`[supabase] slow ${String(options.method || 'GET').toUpperCase()} ${elapsed}ms ${safePath.slice(0, 500)}`);
    }

    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const err = new Error(`Supabase request timed out after ${timeoutMs} ms.`);
      err.code = 'SUPABASE_TIMEOUT';
      err.status = 504;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

function postgrestInValue(value) {
  const raw = String(value ?? '').trim();
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return raw;
  return `\"${raw.replace(/\\/g, '\\\\').replace(/\"/g, '\\\"')}\"`;
}

async function selectByIds(table, ids = [], { idColumn = 'id', select: selectExpr = '*', order = null, limit = 5000 } = {}) {
  const clean = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)));
  if (!clean.length) return [];
  const safeLimit = Math.min(5000, Math.max(clean.length, Number(limit) || 5000));
  const params = {
    select: selectExpr,
    [String(idColumn || 'id')]: `in.(${clean.map(postgrestInValue).join(',')})`,
    limit: safeLimit,
  };
  if (order) params.order = order;
  const rows = await select(table, params);
  return Array.isArray(rows) ? rows : [];
}

async function insert(table, row) {
  const rows = await request(`/${encodeTableName(table)}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: row,
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function insertMany(table, rows = []) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === 'object');
  if (!list.length) return [];
  const data = await request(`/${encodeTableName(table)}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: list,
  });
  return Array.isArray(data) ? data : [];
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
  const clean = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)));
  if (!clean.length) return [];
  const query = buildQuery({ id: `in.(${clean.map(postgrestInValue).join(',')})` });
  const rows = await request(`/${encodeTableName(table)}${query}`, {
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
  const clean = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)));
  if (!clean.length) return [];
  const query = buildQuery({ id: `in.(${clean.map(postgrestInValue).join(',')})` });
  const rows = await request(`/${encodeTableName(table)}${query}`, {
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

async function createSignedUploadUrl(objectPath, { bucketName = null, upsert = false } = {}) {
  const { url, key, storageBucket } = getConfig();
  const bucket = String(bucketName || storageBucket || '').trim();
  const cleanPath = String(objectPath || '').replace(/^\/+/, '');
  if (!isConfigured() || !bucket) {
    const err = new Error('Supabase Storage is not configured. Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or a storage bucket.');
    err.code = 'SUPABASE_STORAGE_NOT_CONFIGURED';
    throw err;
  }
  if (!cleanPath) {
    const err = new Error('Storage object path is required.');
    err.code = 'SUPABASE_STORAGE_PATH_REQUIRED';
    throw err;
  }

  const endpoint = `${url}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodeStoragePath(cleanPath)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'x-upsert': upsert ? 'true' : 'false',
    },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const message = data && typeof data === 'object'
      ? (data.message || data.error || JSON.stringify(data))
      : (text || `Failed to create signed upload URL with status ${res.status}`);
    const err = new Error(message);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  const token = String(data?.token || '').trim();
  let signedUrl = String(data?.signedUrl || data?.signedURL || data?.url || '').trim();
  if (!signedUrl && token) {
    signedUrl = `${endpoint}?token=${encodeURIComponent(token)}`;
  } else if (signedUrl.startsWith('/storage/v1/')) {
    signedUrl = `${url}${signedUrl}`;
  } else if (signedUrl.startsWith('/object/')) {
    signedUrl = `${url}/storage/v1${signedUrl}`;
  } else if (signedUrl && !/^https?:\/\//i.test(signedUrl)) {
    signedUrl = `${url}/storage/v1/${signedUrl.replace(/^\/+/, '')}`;
  }
  if (token && signedUrl && !/[?&]token=/.test(signedUrl)) {
    signedUrl += `${signedUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }
  if (!signedUrl) throw new Error('Supabase Storage did not return a signed upload URL.');
  return { bucket, path: cleanPath, token, signedUrl, publicUrl: storagePublicUrl(cleanPath, bucket), data };
}

async function createSignedDownloadUrl(objectPath, { bucketName = null, expiresIn = 180 } = {}) {
  const { url, key, storageBucket } = getConfig();
  const bucket = String(bucketName || storageBucket || '').trim();
  const cleanPath = String(objectPath || '').replace(/^\/+/, '');
  // Curriculum PDF viewing uses direct, short-lived Storage URLs so PDF.js can
  // request byte ranges without routing every chunk through the Node server.
  // Allow up to one hour; callers still choose the actual (usually shorter)
  // lifetime they need.
  const safeExpiresIn = Math.max(30, Math.min(3600, Number(expiresIn) || 180));
  if (!isConfigured() || !bucket) {
    const err = new Error('Supabase Storage is not configured. Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or a storage bucket.');
    err.code = 'SUPABASE_STORAGE_NOT_CONFIGURED';
    throw err;
  }
  if (!cleanPath) {
    const err = new Error('Storage object path is required.');
    err.code = 'SUPABASE_STORAGE_PATH_REQUIRED';
    throw err;
  }

  const endpoint = `${url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodeStoragePath(cleanPath)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: safeExpiresIn }),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const message = data && typeof data === 'object'
      ? (data.message || data.error || JSON.stringify(data))
      : (text || `Failed to create signed preview URL with status ${res.status}`);
    const err = new Error(message);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  const token = String(data?.token || '').trim();
  let signedUrl = String(data?.signedURL || data?.signedUrl || data?.url || '').trim();
  if (!signedUrl && token) {
    signedUrl = `${endpoint}?token=${encodeURIComponent(token)}`;
  } else if (signedUrl.startsWith('/storage/v1/')) {
    signedUrl = `${url}${signedUrl}`;
  } else if (signedUrl.startsWith('/object/')) {
    signedUrl = `${url}/storage/v1${signedUrl}`;
  } else if (signedUrl && !/^https?:\/\//i.test(signedUrl)) {
    signedUrl = `${url}/storage/v1/${signedUrl.replace(/^\/+/, '')}`;
  }
  if (token && signedUrl && !/[?&]token=/.test(signedUrl)) {
    signedUrl += `${signedUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  }
  if (!signedUrl) throw new Error('Supabase Storage did not return a signed preview URL.');
  return { bucket, path: cleanPath, token, signedUrl, expiresIn: safeExpiresIn, data };
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

module.exports = { getConfig, isConfigured, request, select, selectAll, selectById, selectByIds, insert, insertMany, updateById, updateByIds, deleteById, deleteByIds, uploadStorageObject, createSignedUploadUrl, createSignedDownloadUrl, deleteStorageObjects, storagePublicUrl };
