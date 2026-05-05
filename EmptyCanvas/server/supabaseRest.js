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
  return { url, key, teamMembersTable };
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

async function selectAll(table, { limit = 1000 } = {}) {
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 1000));
  return await request(`/${encodeTableName(table)}?select=*&limit=${safeLimit}`);
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

module.exports = { getConfig, isConfigured, selectAll, selectById, insert, updateById };
