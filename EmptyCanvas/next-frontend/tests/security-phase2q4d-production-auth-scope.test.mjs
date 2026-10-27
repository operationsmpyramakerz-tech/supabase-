import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  parseProductionAuthScopeConfig, parseProductionAuthScopeCookies,
  runProductionAuthScopeChecks,
} from "../lib/production-auth-scope-probe.mjs";

function valid() {
  return {
    ERP_PROD_SCOPE_CONSENT: "I_CONFIRM_AUTHENTICATED_PRODUCTION_GET_ONLY",
    ERP_PROD_SCOPE_BASE_URL: "https://operation.propyramakerz.com/next",
    ERP_PROD_SCOPE_EXPECTED_HOSTNAME: "operation.propyramakerz.com",
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
    { ERP_PROD_SCOPE_BASE_URL: "http://operation.propyramakerz.com/next" },
    { ERP_PROD_SCOPE_BASE_URL: "https://operation.propyramakerz.com:444/next" },
    { ERP_PROD_SCOPE_BASE_URL: "https://operation.propyramakerz.com/next/orders" },
    { ERP_PROD_SCOPE_BASE_URL: "https://operation.propyramakerz.com/next?secret=x" },
    { ERP_PROD_SCOPE_BASE_URL: "https://user:pass@operation.propyramakerz.com/next" },
    { ERP_PROD_SCOPE_EXPECTED_HOSTNAME: "host.example.test" },
    { ERP_PROD_SCOPE_ORDER_OWN: "ORD-11" },
    { ERP_PROD_SCOPE_ORDER_OWN: "0" },
    { ERP_PROD_SCOPE_ORDER_TEAM: "11" },
  ]) assert.throws(() => parseProductionAuthScopeConfig({ ...valid(), ...change }));
});

test("2Q4D: cannot redirect authorized session cookies to another HTTPS host even when both env host fields agree", () => {
  const env = valid();
  env.ERP_PROD_SCOPE_BASE_URL = "https://attacker.example.test/next";
  env.ERP_PROD_SCOPE_EXPECTED_HOSTNAME = "attacker.example.test";
  assert.throws(() => parseProductionAuthScopeConfig(env), /reviewed ERP Production URL/);
  const similarlyNamed = {
    ...valid(),
    ERP_PROD_SCOPE_BASE_URL: "https://operation.propyramakerz.com.evil.test/next",
    ERP_PROD_SCOPE_EXPECTED_HOSTNAME: "operation.propyramakerz.com.evil.test",
  };
  assert.throws(() => parseProductionAuthScopeConfig(similarlyNamed), /reviewed ERP Production URL/);
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
    assert.ok(url.startsWith("https://operation.propyramakerz.com/next/api/"));
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

test("2Q4D: streamed oversized JSON is BLOCKED even without Content-Length", async () => {
  const config = parseProductionAuthScopeConfig(valid());
  const cookies = parseProductionAuthScopeCookies(valid());
  const oversize = async (_url, _options) => ({
    status: 200,
    headers: { get: () => null },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_050_000));
        controller.enqueue(new Uint8Array(1_050_000));
        controller.close();
      },
    }),
  });
  const result = await runProductionAuthScopeChecks(config, cookies, { fetchImpl: oversize });
  assert.equal(result.passed, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.blocked, 5); // four identities and skipped matrix
});

test("2Q4D: streaming JSON response supports ordinary session identity verification", async () => {
  const server = mockServer();
  const responseAsStream = async (url, options) => {
    const original = await server.spy(url, options);
    if (original.status !== 200) return original;
    const data = await original.json();
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    return {
      status: 200,
      headers: { get: () => null },
      body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
    };
  };
  const result = await runProductionAuthScopeChecks(parseProductionAuthScopeConfig(valid()), parseProductionAuthScopeCookies(valid()), { fetchImpl: responseAsStream });
  assert.equal(result.failed, 0);
  assert.equal(result.blocked, 0);
  assert.equal(result.passed, 15);
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


test("2Q4D: CLI help and configuration-only mode never need cookies or contact Production", () => {
  const script = new URL("../scripts/security-production-auth-scope.mjs", import.meta.url).pathname;
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8", env: {} });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /No test action changes/);
  const env = valid();
  for (const key of Object.keys(env)) if (key.startsWith("ERP_PROD_SCOPE_COOKIE_")) delete env[key];
  const preflight = spawnSync(process.execPath, [script, "--check-config"], { encoding: "utf8", env });
  assert.equal(preflight.status, 0);
  assert.match(preflight.stdout, /No cookies read; no requests sent/);
  const wrong = spawnSync(process.execPath, [script, "--check-config"], {
    encoding: "utf8", env: { ...env, ERP_PROD_SCOPE_BASE_URL: "https://wrong.example.test/next", ERP_PROD_SCOPE_EXPECTED_HOSTNAME: "wrong.example.test" },
  });
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /No cookies read; no requests sent/);
});
