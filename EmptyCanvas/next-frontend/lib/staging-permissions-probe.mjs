// Phase 2Q4B: dependency-free, READ-ONLY black-box authorization probes.
// Run only against an isolated Staging deployment, with disposable test users.
// This module never mutates grants, users, orders or database contents.
const requiredRoles = ["DENIED", "OWN", "TEAM", "ALL"];
const requiredIds = ["OWN", "TEAM", "OUTSIDE"];
const consent = "I_CONFIRM_ISOLATED_STAGING";
const clean = value => String(value ?? "").trim();

export function parseStagingProbeConfig(env = {}) {
  if (clean(env.ERP_STAGING_PROBE_CONSENT) !== consent) {
    throw new Error("Staging-only confirmation is required; no requests sent.");
  }
  let base;
  try { base = new URL(clean(env.ERP_STAGING_BASE_URL)); }
  catch { throw new Error("ERP_STAGING_BASE_URL must be a complete HTTPS URL."); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.port && !/^\d+$/.test(base.port)) {
    throw new Error("Use a clean HTTPS Staging URL without credentials, query or fragment.");
  }
  const expectedHost = clean(env.ERP_STAGING_EXPECTED_HOSTNAME).toLowerCase();
  if (!expectedHost || base.hostname.toLowerCase() !== expectedHost) {
    throw new Error("ERP_STAGING_EXPECTED_HOSTNAME must exactly match the Staging hostname.");
  }
  // Avoid accidentally pointing the smoke tests at an app explicitly named
  // as the public production instance in the same environment.
  if (clean(env.ERP_PUBLIC_URL)) {
    let publicUrl;
    try { publicUrl = new URL(clean(env.ERP_PUBLIC_URL)); } catch { /* malformed value does not confer permission */ }
    if (publicUrl?.origin === base.origin) {
      throw new Error("Staging and ERP_PUBLIC_URL cannot use the same origin.");
    }
  }
  const basePath = base.pathname.replace(/\/+$/, "");
  if (!/^\/(?:[a-zA-Z0-9_-]+)?$/.test(basePath)) {
    throw new Error("Staging URL path must be a single Next.js basePath such as /next.");
  }
  const ids = {};
  for (const name of requiredIds) {
    const id = clean(env[`ERP_STAGING_COMPONENT_${name}`]);
    if (!id || id.length > 128 || /[\r\n\x00-\x1f]/.test(id)) {
      throw new Error(`ERP_STAGING_COMPONENT_${name} must be a valid disposable component ID.`);
    }
    ids[name] = id;
  }
  if (new Set(Object.values(ids)).size !== requiredIds.length) {
    throw new Error("Staging component fixtures must be different records.");
  }
  const cookies = {};
  for (const name of requiredRoles) {
    const cookie = clean(env[`ERP_STAGING_COOKIE_${name}`]);
    if (!cookie || cookie.length > 8192 || /[\r\n\x00-\x1f]/.test(cookie)) {
      throw new Error(`ERP_STAGING_COOKIE_${name} is required; do not commit or share cookies.`);
    }
    cookies[name] = cookie;
  }
  if (new Set(Object.values(cookies)).size !== requiredRoles.length) {
    throw new Error("Four distinct Staging browser sessions are required.");
  }
  return { origin: base.origin, basePath, ids, cookies };
}

function check(name, role, method, path, allowed, idName = "") {
  return Object.freeze({ name, role, method, path, allowed, idName });
}

export function buildStagingChecks() {
  // Only read routes: GET paged summaries, and POST details-direct (read-only).
  return [
    check("anonymous-operations-list", "", "GET", "/api/orders/requested/paged-summary?limit=1", false),
    check("denied-operations-list", "DENIED", "GET", "/api/orders/requested/paged-summary?limit=1", false),
    check("denied-operations-details", "DENIED", "POST", "/api/orders/requested/details-direct", false, "OWN"),
    check("own-reads-own", "OWN", "POST", "/api/orders/requested/details-direct", true, "OWN"),
    check("own-denied-team", "OWN", "POST", "/api/orders/requested/details-direct", false, "TEAM"),
    check("own-denied-outsider", "OWN", "POST", "/api/orders/requested/details-direct", false, "OUTSIDE"),
    check("team-reads-linked-owner", "TEAM", "POST", "/api/orders/requested/details-direct", true, "OWN"),
    check("team-reads-team-owner", "TEAM", "POST", "/api/orders/requested/details-direct", true, "TEAM"),
    check("team-denied-outsider", "TEAM", "POST", "/api/orders/requested/details-direct", false, "OUTSIDE"),
    check("all-reads-outsider", "ALL", "POST", "/api/orders/requested/details-direct", true, "OUTSIDE"),
    check("all-operations-list", "ALL", "GET", "/api/orders/requested/paged-summary?limit=1", true),
    check("anonymous-my-orders-list", "", "GET", "/api/orders/current/paged-summary?limit=1", false),
  ];
}

export async function runStagingReadOnlyProbes(config, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const results = [];
  for (const probe of buildStagingChecks()) {
    const url = `${config.origin}${config.basePath}${probe.path}`;
    const headers = { Accept: "application/json", "Cache-Control": "no-store" };
    if (probe.role) headers.Cookie = config.cookies[probe.role];
    if (probe.method === "POST") headers["Content-Type"] = "application/json";
    const options = {
      method: probe.method,
      headers,
      redirect: "manual", // Never forward Staging session cookies to a redirect target.
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      ...(probe.method === "POST" ? { body: JSON.stringify({ orderIds: [config.ids[probe.idName]] }) } : {}),
    };
    try {
      const response = await fetchImpl(url, options);
      let pass = probe.allowed ? response.status === 200 : [401, 403, 404].includes(response.status);
      let reason = pass ? "expected-status" : "unexpected-status";
      if (probe.allowed && probe.idName && response.status === 200) {
        // A 200 with an empty/error object must never count as permission granted.
        const data = await response.json().catch(() => null);
        pass = Array.isArray(data) && data.some(row => String(row?.id ?? "").trim() === config.ids[probe.idName]);
        reason = pass ? "requested-row-present" : "requested-row-missing";
      }
      // Denied results intentionally never parse/record server responses.
      results.push({ check: probe.name, result: pass ? "PASS" : "FAIL", status: response.status, reason });
    } catch {
      // Don't expose URLs, session cookies, response bodies, exception stacks.
      results.push({ check: probe.name, result: "BLOCKED", status: null, reason: "request-unavailable" });
    }
  }
  return {
    checks: results,
    passed: results.filter(row => row.result === "PASS").length,
    failed: results.filter(row => row.result === "FAIL").length,
    blocked: results.filter(row => row.result === "BLOCKED").length,
  };
}
