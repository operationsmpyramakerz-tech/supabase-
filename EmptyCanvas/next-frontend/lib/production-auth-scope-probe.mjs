// Phase 2Q4D: opt-in, authenticated production scope verification using ONLY
// GET routes. Does not access write APIs or print/store credentials or rows.
const CONSENT = "I_CONFIRM_AUTHENTICATED_PRODUCTION_GET_ONLY";
// This tool sends live session cookies. Never derive the destination solely
// from operator-provided env values (both could point at the same wrong host).
// Any legitimate production host move requires a reviewed code change.
const TRUSTED_PRODUCTION_URL = "https://operation.propyramakerz.com/next";
const MAX_JSON_BYTES = 2_000_000;
const ROLES = Object.freeze(["DENIED", "OWN", "TEAM", "ALL"]);
const FIXTURES = Object.freeze(["OWN", "TEAM", "OUTSIDE"]);
const clean = (v) => String(v ?? "").trim();

export function parseProductionAuthScopeConfig(env = {}, { requireConsent = true } = {}) {
  // A local-only configuration check never reads cookies or connects to Production.
  // Reserve consent for the live authenticated probe; do not make it a prerequisite
  // to checking three order numbers and the reviewed destination offline.
  if (requireConsent && clean(env.ERP_PROD_SCOPE_CONSENT) !== CONSENT) {
    throw new Error("Authenticated production GET-only consent is required; no requests sent.");
  }
  let url;
  try { url = new URL(clean(env.ERP_PROD_SCOPE_BASE_URL)); }
  catch { throw new Error("A complete HTTPS ERP_PROD_SCOPE_BASE_URL is required."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port ||
      !/^\/(?:[a-zA-Z0-9_-]+)?\/?$/.test(url.pathname)) {
    throw new Error("Use a clean HTTPS origin and optional single application basePath, e.g. /next.");
  }
  const hostname = clean(env.ERP_PROD_SCOPE_EXPECTED_HOSTNAME).toLowerCase();
  if (!hostname || !/^[a-z0-9.-]+$/.test(hostname) || hostname !== url.hostname.toLowerCase()) {
    throw new Error("Expected hostname must match the production URL exactly.");
  }
  if (`${url.origin}${url.pathname.replace(/\/+$/, "")}` !== TRUSTED_PRODUCTION_URL) {
    throw new Error("Authenticated cookies can only be sent to the reviewed ERP Production URL.");
  }
  const orders = {};
  for (const fixture of FIXTURES) {
    const raw = clean(env[`ERP_PROD_SCOPE_ORDER_${fixture}`]);
    if (!/^[1-9]\d{0,8}$/.test(raw)) {
      throw new Error(`ERP_PROD_SCOPE_ORDER_${fixture} must be an existing numeric ORD number, not a component ID.`);
    }
    orders[fixture] = Number(raw);
  }
  if (new Set(Object.values(orders)).size !== FIXTURES.length) {
    throw new Error("OWN, TEAM and OUTSIDE must refer to distinct existing orders.");
  }
  return { origin: url.origin, basePath: url.pathname.replace(/\/+$/, ""), orders };
}

export function parseProductionAuthScopeCookies(env = {}) {
  const cookies = {};
  for (const role of ROLES) {
    const cookie = clean(env[`ERP_PROD_SCOPE_COOKIE_${role}`]);
    // A complete Cookie header supplied by the consenting account holder.
    // Never place raw session cookies in commands, Git, logs, reports or chat.
    if (!cookie || cookie.length > 8192 || /[\x00-\x1f\x7f]/.test(cookie) ||
        !/^[^=;\s]+=[^;]+(?:;\s*[^=;\s]+=[^;]+)*$/.test(cookie)) {
      throw new Error(`Missing or invalid private cookie for ${role}; no requests sent.`);
    }
    cookies[role] = cookie;
  }
  if (new Set(Object.values(cookies)).size !== ROLES.length) {
    throw new Error("Four different authorized account sessions are required.");
  }
  return cookies;
}

function check(name, result, status, reason) {
  return { check: name, result, status: status ?? null, reason };
}
function totals(checks) {
  return {
    checks,
    passed: checks.filter(c => c.result === "PASS").length,
    failed: checks.filter(c => c.result === "FAIL").length,
    blocked: checks.filter(c => c.result === "BLOCKED").length,
  };
}

// Fetch response bodies with a strict post-decompression byte ceiling. A
// Content-Length header may be omitted or inaccurate, so enforce the bound
// while reading as well. No response data is logged or persisted.
async function boundedJsonResponse(response) {
  const lengthHeader = response?.headers?.get?.("content-length");
  const length = lengthHeader === null || lengthHeader === undefined ? NaN : Number(lengthHeader);
  if (Number.isFinite(length) && length > MAX_JSON_BYTES) {
    await response?.body?.cancel?.().catch(() => {});
    return null;
  }
  if (!response?.body || typeof response.body.getReader !== "function") {
    // For test/mocked responses only; actual Node fetch provides a stream.
    return typeof response?.json === "function" ? await response.json().catch(() => null) : null;
  }
  const reader = response.body.getReader();
  let received = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const bytes = value?.byteLength || 0;
      received += bytes;
      if (received > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return JSON.parse(new TextDecoder().decode(buffer)); }
  catch { return null; }
}

async function requestJson(config, path, cookie, fetchImpl, timeoutMs) {
  // Every request is a fixed GET against the exact previously confirmed host.
  // Never follow redirects, forward cookies or add credentials to a URL.
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json", "Cache-Control": "no-store",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
  };
  try {
    const response = await fetchImpl(`${config.origin}${config.basePath}${path}`, options);
    const status = Number(response?.status);
    if (!Number.isInteger(status)) return { status: null, data: null };
    if (status !== 200) return { status, data: null };
    const data = await boundedJsonResponse(response);
    return { status, data };
  } catch {
    return { status: null, data: null };
  }
}

function probeOrderPayload(data, orderNumber) {
  if (!data || !Array.isArray(data.items) || data.pageInfo?.serverFiltered !== true ||
      clean(data.pageInfo?.query).toUpperCase() !== `ORD-${orderNumber}`) return "invalid";
  const ids = data.items.map(item => Number(item?.orderIdNumber));
  if (ids.some(num => !Number.isInteger(num) || num !== orderNumber)) return "invalid";
  return ids.length ? "visible" : "hidden";
}
function orderPath(number) {
  return `/api/orders/requested/paged-summary?limit=1&q=ORD-${number}`;
}

export async function runProductionAuthScopeChecks(config, cookies, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const checks = [];
  // This is an authenticated probe. A 403 can mean either a real denial or an
  // invalid/expired session, so confirm four distinct authenticated identities.
  const members = new Set();
  let identitiesOk = true;
  for (const role of ROLES) {
    const { status, data } = await requestJson(config, "/api/auth/session-status", cookies[role], fetchImpl, timeoutMs);
    const id = clean(data?.memberId);
    const valid = status === 200 && data?.authenticated === true && !!id && !members.has(id);
    if (valid) members.add(id);
    else identitiesOk = false;
    checks.push(check(`identity-${role.toLowerCase()}`, valid ? "PASS" : "BLOCKED", status,
      valid ? "distinct-session-confirmed" : "session-unverified-or-duplicate"));
  }
  if (!identitiesOk) {
    checks.push(check("authorization-matrix", "BLOCKED", null, "identity-prerequisites-not-met"));
    return totals(checks);
  }

  const anonymous = await requestJson(config, "/api/orders/requested/paged-summary?limit=1", "", fetchImpl, timeoutMs);
  checks.push(check("anonymous-operations", [401, 403].includes(anonymous.status) ? "PASS"
    : anonymous.status === 200 ? "FAIL" : "BLOCKED", anonymous.status, "no-session"));

  const denied = await requestJson(config, "/api/orders/requested/paged-summary?limit=1", cookies.DENIED, fetchImpl, timeoutMs);
  checks.push(check("explicit-deny-operations-view", denied.status === 403 ? "PASS"
    : denied.status === 200 ? "FAIL" : "BLOCKED", denied.status, "view-permission"));

  // Canaries: ALL must prove each order exists, or a missing number could
  // cause a misleading PASS for a restricted session.
  let canariesOk = true;
  for (const fixture of FIXTURES) {
    const n = config.orders[fixture];
    const response = await requestJson(config, orderPath(n), cookies.ALL, fetchImpl, timeoutMs);
    const visible = response.status === 200 && probeOrderPayload(response.data, n) === "visible";
    if (!visible) canariesOk = false;
    checks.push(check(`all-canary-${fixture.toLowerCase()}`, visible ? "PASS" : "BLOCKED",
      response.status, visible ? "reference-order-confirmed" : "reference-or-session-inconclusive"));
  }
  if (!canariesOk) {
    checks.push(check("scope-matrix", "BLOCKED", null, "order-reference-prerequisites-not-met"));
    return totals(checks);
  }

  for (const [role, fixture, shouldSee] of [
    ["OWN", "OWN", true], ["OWN", "TEAM", false], ["OWN", "OUTSIDE", false],
    ["TEAM", "OWN", true], ["TEAM", "TEAM", true], ["TEAM", "OUTSIDE", false],
  ]) {
    const n = config.orders[fixture];
    const response = await requestJson(config, orderPath(n), cookies[role], fetchImpl, timeoutMs);
    const outcome = response.status === 200 ? probeOrderPayload(response.data, n) : "invalid";
    let result = "BLOCKED";
    if (response.status === 200 && outcome !== "invalid") {
      result = (shouldSee ? outcome === "visible" : outcome === "hidden") ? "PASS" : "FAIL";
    } else if (!shouldSee && [403, 404].includes(response.status)) {
      result = "PASS";
    } else if (shouldSee && response.status === 403) {
      result = "FAIL";
    }
    checks.push(check(`${role.toLowerCase()}-${fixture.toLowerCase()}`, result, response.status,
      outcome === "invalid" ? "unverified-response-or-denial" : shouldSee ? "expected-visible" : "expected-hidden"));
  }
  return totals(checks);
}
