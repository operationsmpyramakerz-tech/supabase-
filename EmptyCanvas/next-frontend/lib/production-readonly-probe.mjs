// Phase 2Q4C: production-safe, anonymous, strictly GET-only negative permission checks.
// This cannot verify Own/Team/All policies or authorize destructive tests.
const CONSENT = "I_CONFIRM_ANONYMOUS_PRODUCTION_READ_ONLY";
const clean = (value) => String(value ?? "").trim();

const CHECKS = Object.freeze([
  Object.freeze({ name: "anonymous-operations-orders", path: "/api/orders/requested/paged-summary?limit=1" }),
  Object.freeze({ name: "anonymous-my-orders", path: "/api/orders/current/paged-summary?limit=1" }),
  Object.freeze({ name: "anonymous-expenses-types", path: "/api/expenses/types" }),
  Object.freeze({ name: "anonymous-stock-columns", path: "/api/stock/columns" }),
  Object.freeze({ name: "anonymous-users-directory", path: "/api/users-center/directory" }),
]);

export function parseProductionReadOnlyConfig(env = {}) {
  if (clean(env.ERP_PRODUCTION_READONLY_CONSENT) !== CONSENT) {
    throw new Error("Production anonymous read-only consent is required; no requests sent.");
  }
  let url;
  try { url = new URL(clean(env.ERP_PRODUCTION_READONLY_BASE_URL)); }
  catch { throw new Error("A complete HTTPS ERP_PRODUCTION_READONLY_BASE_URL is required."); }
  if (
    url.protocol !== "https:" || url.username || url.password ||
    url.search || url.hash || url.port ||
    !/^\/(?:[A-Za-z0-9_-]+)?\/?$/.test(url.pathname)
  ) {
    throw new Error("Use only a clean HTTPS production origin and optional single basePath (e.g. /next).");
  }
  const expectedHost = clean(env.ERP_PRODUCTION_READONLY_EXPECTED_HOSTNAME).toLowerCase();
  if (!expectedHost || /[^a-z0-9.-]/.test(expectedHost) || url.hostname.toLowerCase() !== expectedHost) {
    throw new Error("ERP_PRODUCTION_READONLY_EXPECTED_HOSTNAME must match the URL hostname exactly.");
  }
  // Do not consume or log secrets passed accidentally in the shell environment.
  const basePath = url.pathname.replace(/\/+$/, "");
  return { origin: url.origin, basePath };
}

export function buildProductionReadOnlyChecks() { return CHECKS; }

export async function runProductionReadOnlyChecks(config, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const results = [];
  for (const { name, path } of CHECKS) {
    // No authentication/cookies, no POST, no query supplied by the caller.
    const options = {
      method: "GET",
      headers: { Accept: "application/json", "Cache-Control": "no-store" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    };
    try {
      const response = await fetchImpl(`${config.origin}${config.basePath}${path}`, options);
      const status = response.status;
      const result = status === 401 || status === 403 ? "PASS"
        : status === 200 ? "FAIL" : "BLOCKED";
      results.push({ check: name, result, status, reason: result === "PASS" ? "anonymous-rejected" : result === "FAIL" ? "anonymous-allowed" : "inconclusive-response" });
    } catch {
      results.push({ check: name, result: "BLOCKED", status: null, reason: "request-unavailable" });
    }
  }
  return {
    checks: results,
    passed: results.filter((row) => row.result === "PASS").length,
    failed: results.filter((row) => row.result === "FAIL").length,
    blocked: results.filter((row) => row.result === "BLOCKED").length,
  };
}
