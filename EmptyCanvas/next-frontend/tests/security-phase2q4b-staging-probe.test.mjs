import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStagingProbeConfig, buildStagingChecks, runStagingReadOnlyProbes } from "../lib/staging-permissions-probe.mjs";

const valid = () => ({
  ERP_STAGING_PROBE_CONSENT: "I_CONFIRM_ISOLATED_STAGING",
  ERP_STAGING_BASE_URL: "https://staging.example.test/next",
  ERP_STAGING_EXPECTED_HOSTNAME: "staging.example.test",
  ERP_PUBLIC_URL: "https://production.example.test/next",
  ERP_STAGING_COMPONENT_OWN: "own-component",
  ERP_STAGING_COMPONENT_TEAM: "team-component",
  ERP_STAGING_COMPONENT_OUTSIDE: "outside-component",
  ERP_STAGING_COOKIE_DENIED: "erp_session=denied-secret",
  ERP_STAGING_COOKIE_OWN: "erp_session=own-secret",
  ERP_STAGING_COOKIE_TEAM: "erp_session=team-secret",
  ERP_STAGING_COOKIE_ALL: "erp_session=all-secret",
});

const response = (status, data = null) => ({
  status,
  json: async () => data,
});

test("2Q4B: incomplete or unapproved staging settings block execution before networking", () => {
  for (const override of [
    { ERP_STAGING_PROBE_CONSENT: "" },
    { ERP_STAGING_PROBE_CONSENT: "yes" },
    { ERP_STAGING_BASE_URL: "http://staging.example.test/next" },
    { ERP_STAGING_BASE_URL: "https://production.example.test/next", ERP_STAGING_EXPECTED_HOSTNAME: "production.example.test" },
    { ERP_STAGING_EXPECTED_HOSTNAME: "wrong.example.test" },
    { ERP_STAGING_COMPONENT_TEAM: "own-component" },
    { ERP_STAGING_COMPONENT_OWN: "" },
    { ERP_STAGING_COOKIE_TEAM: "erp_session=own-secret" },
    { ERP_STAGING_COOKIE_ALL: "" },
    { ERP_STAGING_COOKIE_ALL: "x\r\nHost:evil.test" },
    { ERP_STAGING_BASE_URL: "https://staging.example.test/next/api/orders/current" },
    { ERP_STAGING_BASE_URL: "https://staging.example.test@evil.test/next", ERP_STAGING_EXPECTED_HOSTNAME: "evil.test" },
  ]) assert.throws(() => parseStagingProbeConfig({ ...valid(), ...override }));
});

test("2Q4B: checks target only read routes, and no mutation/action endpoints", () => {
  const checks = buildStagingChecks();
  assert.ok(checks.length >= 10);
  for (const { method, path } of checks) {
    assert.ok(method === "GET" || method === "POST");
    if (method === "POST") assert.match(path, /^\/api\/orders\/(requested|current)\/details-direct$/);
    else assert.match(path, /^\/api\/orders\/(requested|current)\/paged-summary\?/);
    assert.doesNotMatch(path, /mutation|delete|archive|upload|edit|export/);
  }
});

test("2Q4B: expected deny, own/team/all allowance and anonymous checks produce PASS with no leaked cookies", async () => {
  const conf = parseStagingProbeConfig(valid());
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, init });
    const role = Object.entries(conf.cookies).find(([, cookie]) => init.headers.Cookie === cookie)?.[0] || "ANONYMOUS";
    const ids = init.body ? JSON.parse(init.body).orderIds : [];
    if (role === "ANONYMOUS") return response(401);
    if (role === "DENIED") return response(403);
    if (role === "OWN" && ids[0] !== conf.ids.OWN) return response(403);
    if (role === "TEAM" && ids[0] === conf.ids.OUTSIDE) return response(403);
    return response(200, ids.length ? [{ id: ids[0] }] : { ok: true });
  };
  const result = await runStagingReadOnlyProbes(conf, { fetchImpl: fakeFetch });
  assert.equal(result.failed, 0);
  assert.equal(result.blocked, 0);
  assert.equal(result.passed, buildStagingChecks().length);
  assert.equal(seen.length, buildStagingChecks().length);
  for (const { url, init } of seen) {
    assert.ok(url.startsWith("https://staging.example.test/next/api/"));
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, "no-store");
  }
  assert.doesNotMatch(JSON.stringify(result), /-secret|erp_session=|example\.test|own-component|team-component|outside-component/);
});

test("2Q4B: 200 on a forbidden request MUST fail; not fooled by hidden UI", async () => {
  const cfg = parseStagingProbeConfig(valid());
  const fakeFetch = async (_, init) => response(200, init.body ? [{ id: JSON.parse(init.body).orderIds[0] }] : { ok: true });
  const result = await runStagingReadOnlyProbes(cfg, { fetchImpl: fakeFetch });
  assert.ok(result.failed >= 4);
  assert.equal(result.blocked, 0);
});

test("2Q4B: empty success and server failures are NOT accepted as authorized", async () => {
  const cfg = parseStagingProbeConfig(valid());
  const emptyFetch = async (_, init) => response(init.headers.Cookie === cfg.cookies.OWN ? 200 : 403, []);
  const result = await runStagingReadOnlyProbes(cfg, { fetchImpl: emptyFetch });
  assert.equal(result.checks.find(c => c.check === "own-reads-own").result, "FAIL");
  assert.equal(result.checks.find(c => c.check === "own-reads-own").reason, "requested-row-missing");
  assert.equal(result.checks.find(c => c.check === "all-reads-outsider").result, "FAIL");
  const unavailable = await runStagingReadOnlyProbes(cfg, { fetchImpl: async () => { throw Error("TOKEN=" + cfg.cookies.ALL); } });
  assert.equal(unavailable.blocked, buildStagingChecks().length);
  assert.doesNotMatch(JSON.stringify(unavailable), /TOKEN|secret/);
});

test("2Q4B: redirect and 503 are blockers/failures, never successful access control", async () => {
  const cfg = parseStagingProbeConfig(valid());
  for (const status of [302, 503]) {
    const result = await runStagingReadOnlyProbes(cfg, { fetchImpl: async () => response(status) });
    assert.equal(result.passed, 0);
    assert.equal(result.failed, buildStagingChecks().length);
  }
});

test("2Q4B: target API endpoints use the current server permission gates and scoped row lookups", () => {
  const from = filename => readFileSync(new URL(`../${filename}`, import.meta.url), "utf8");
  const summary = from("app/api/orders/requested/paged-summary/route.js");
  const details = from("app/api/orders/requested/details-direct/route.js");
  const currentSummary = from("app/api/orders/current/paged-summary/route.js");
  assert.ok(summary.includes('"orders.operations.view"'));
  assert.ok(details.includes('"orders.operations.details"'));
  assert.ok(details.includes('await assertOrderIdsInScope(gate.account, "orders.operations.details", orderIds)'));
  assert.ok(currentSummary.includes('"orders.my.view"'));
  assert.ok(details.indexOf("await assertOrderIdsInScope(") < details.indexOf("await loadOperationsOrderDetails("));
});
