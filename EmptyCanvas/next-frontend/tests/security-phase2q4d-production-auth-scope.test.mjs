import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseProductionAuthScopeConfig, parseProductionAuthScopeCookies,
  runProductionAuthScopeChecks,
} from "../lib/production-auth-scope-probe.mjs";

function valid() {
  return {
    ERP_PROD_SCOPE_CONSENT: "I_CONFIRM_AUTHENTICATED_PRODUCTION_GET_ONLY",
    ERP_PROD_SCOPE_BASE_URL: "https://erp.example.test/next",
    ERP_PROD_SCOPE_EXPECTED_HOSTNAME: "erp.example.test",
    ERP_PROD_SCOPE_ORDER_OWN: "11", ERP_PROD_SCOPE_ORDER_TEAM: "22", ERP_PROD_SCOPE_ORDER_OUTSIDE: "33",
    ERP_PROD_SCOPE_COOKIE_DENIED: "erp_session=denied-secret",
    ERP_PROD_SCOPE_COOKIE_OWN: "erp_session=own-secret",
    ERP_PROD_SCOPE_COOKIE_TEAM: "erp_session=team-secret",
    ERP_PROD_SCOPE_COOKIE_ALL: "erp_session=all-secret",
  };
}
const response = (status, data = null) => ({ status, json: async () => data, headers: { get: () => null } });
const payload = (n, show = true) => ({
  items: show ? [{ orderIdNumber: n, orderId: `ORD-${n}` }] : [],
  pageInfo: { serverFiltered: true, query: `ORD-${n}` },
});
function mockServer({ outsideLeak = false, deniedAllowed = false, missingAll = false, duplicate = false, badFormat = false, unauthenticatedRole = "" } = {}) {
  const calls = [];
  const spy = async (url, options) => {
    calls.push({ url, options });
    const cookie = options.headers.Cookie || "";
    const role = cookie.includes("denied-") ? "DENIED" : cookie.includes("own-") ? "OWN"
      : cookie.includes("team-") ? "TEAM" : cookie.includes("all-") ? "ALL" : "anonymous";
    const path = new URL(url);
    if (path.pathname.endsWith("/api/auth/session-status")) {
      if (role === unauthenticatedRole) return response(401, {});
      return response(200, { authenticated: true, memberId: duplicate ? "same-member" : `member-${role}` });
    }
    if (role === "anonymous") return response(401);
    if (role === "DENIED") return response(deniedAllowed ? 200 : 403, deniedAllowed ? payload(11) : null);
    const n = Number(path.searchParams.get("q")?.replace(/^ORD-/, ""));
    if (role === "ALL") return response(200, payload(n, !missingAll || n !== 33));
    if (role === "OWN") {
      const visible = n === 11 || outsideLeak && n === 33;
      return response(200, badFormat ? { message: "not a real page" } : payload(n, visible));
    }
    if (role === "TEAM") return response(200, payload(n, n === 11 || n === 22));
    throw new Error("Unexpected role");
  };
  return { spy, calls };
}

test("2Q4D: invalid consent, hostname, and fixtures are rejected before network", () => {
  for (const change of [
    { ERP_PROD_SCOPE_CONSENT: "" },
    { ERP_PROD_SCOPE_BASE_URL: "http://erp.example.test/next" },
    { ERP_PROD_SCOPE_BASE_URL: "https://erp.example.test:444/next" },
    { ERP_PROD_SCOPE_BASE_URL: "https://erp.example.test/next/orders" },
    { ERP_PROD_SCOPE_BASE_URL: "https://erp.example.test/next?secret=x" },
    { ERP_PROD_SCOPE_BASE_URL: "https://user:pass@erp.example.test/next" },
    { ERP_PROD_SCOPE_EXPECTED_HOSTNAME: "host.example.test" },
    { ERP_PROD_SCOPE_ORDER_OWN: "ORD-11" },
    { ERP_PROD_SCOPE_ORDER_OWN: "0" },
    { ERP_PROD_SCOPE_ORDER_TEAM: "11" },
  ]) assert.throws(() => parseProductionAuthScopeConfig({ ...valid(), ...change }));
});

test("2Q4D: four distinct, private sessions are required", () => {
  for (const change of [
    { ERP_PROD_SCOPE_COOKIE_DENIED: "" },
    { ERP_PROD_SCOPE_COOKIE_DENIED: "erp_session=secret\r\nInjected: 1" },
    { ERP_PROD_SCOPE_COOKIE_DENIED: "not-a-cookie" },
    { ERP_PROD_SCOPE_COOKIE_DENIED: "erp_session=own-secret" },
  ]) assert.throws(() => parseProductionAuthScopeCookies({ ...valid(), ...change }));
});

test("2Q4D: legitimate four-role matrix passes without mutation or output of secrets", async () => {
  const config = parseProductionAuthScopeConfig(valid());
  const cookies = parseProductionAuthScopeCookies(valid());
  const { spy, calls } = mockServer();
  const result = await runProductionAuthScopeChecks(config, cookies, { fetchImpl: spy });
  assert.equal(result.failed, 0);
  assert.equal(result.blocked, 0);
  assert.equal(result.passed, 15);
  assert.equal(calls.length, 15);
  for (const { url, options } of calls) {
    assert.ok(url.startsWith("https://erp.example.test/next/api/"));
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    assert.equal(options.body, undefined);
    assert.equal(options.headers.Authorization, undefined);
    assert.match(url, /\/(api\/auth\/session-status|api\/orders\/requested\/paged-summary)(\?|$)/);
  }
  assert.doesNotMatch(JSON.stringify(result), /erp_session|secret|member-\w+|ORD-\d+/);
});

test("2Q4D: cross-scope data leak produces FAIL", async () => {
  const { spy } = mockServer({ outsideLeak: true });
  const result = await runProductionAuthScopeChecks(parseProductionAuthScopeConfig(valid()), parseProductionAuthScopeCookies(valid()), { fetchImpl: spy });
  assert.equal(result.failed, 1);
  assert.equal(result.checks.find(x => x.check === "own-outside")?.result, "FAIL");
});

test("2Q4D: explicit-deny profile seeing list is FAIL", async () => {
  const { spy } = mockServer({ deniedAllowed: true });
  const result = await runProductionAuthScopeChecks(parseProductionAuthScopeConfig(valid()), parseProductionAuthScopeCookies(valid()), { fetchImpl: spy });
  assert.equal(result.checks.find(x => x.check === "explicit-deny-operations-view")?.result, "FAIL");
});

test("2Q4D: missing all-access fixture blocks scope assertions rather than false PASS", async () => {
  const { spy, calls } = mockServer({ missingAll: true });
  const result = await runProductionAuthScopeChecks(parseProductionAuthScopeConfig(valid()), parseProductionAuthScopeCookies(valid()), { fetchImpl: spy });
  assert.equal(result.blocked, 2);
  assert.equal(result.failed, 0);
  assert.equal(calls.length, 9);
  assert.equal(result.checks.find(x => x.check === "scope-matrix")?.result, "BLOCKED");
});

test("2Q4D: duplicate identity or expired session blocks every authorization assertion", async () => {
  for (const variant of [{ duplicate: true }, { unauthenticatedRole: "OWN" }]) {
    const { spy, calls } = mockServer(variant);
    const result = await runProductionAuthScopeChecks(parseProductionAuthScopeConfig(valid()), parseProductionAuthScopeCookies(valid()), { fetchImpl: spy });
    assert.equal(result.passed < 4, true);
    assert.equal(result.checks.find(x => x.check === "authorization-matrix")?.result, "BLOCKED");
    assert.equal(calls.length, 4);
  }
});

test("2Q4D: invalid list JSON is inconclusive, not permission denied", async () => {
  const { spy } = mockServer({ badFormat: true });
  const result = await runProductionAuthScopeChecks(parseProductionAuthScopeConfig(valid()), parseProductionAuthScopeCookies(valid()), { fetchImpl: spy });
  assert.equal(result.checks.find(x => x.check === "own-outside")?.result, "BLOCKED");
});

test("2Q4D: API routes are GET-only and records checked by number, not component-ID", () => {
  const route = readFileSync(new URL("../app/api/orders/requested/paged-summary/route.js", import.meta.url), "utf8");
  const session = readFileSync(new URL("../app/api/auth/session-status/route.js", import.meta.url), "utf8");
  assert.match(route, /export async function GET\(/);
  assert.match(session, /export async function GET\(/);
  assert.match(route, /featureGate\(/);
  assert.match(route, /loadOperationsOrdersPage/);
  const handler = readFileSync(new URL("../lib/operations-orders-data.js", import.meta.url), "utf8");
  assert.match(handler, /resolveOrderScope\(account, "orders\.operations\.view"\)/);
  assert.match(handler, /applyOrderSearchPlan/);
  const probe = readFileSync(new URL("../lib/production-auth-scope-probe.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(probe, /method:\s*"(?:POST|PATCH|DELETE|PUT)"/);
});
