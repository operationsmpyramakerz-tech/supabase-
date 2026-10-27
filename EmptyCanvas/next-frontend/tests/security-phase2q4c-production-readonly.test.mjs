import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseProductionReadOnlyConfig, buildProductionReadOnlyChecks, runProductionReadOnlyChecks,
} from "../lib/production-readonly-probe.mjs";

const valid = () => ({
  ERP_PRODUCTION_READONLY_CONSENT: "I_CONFIRM_ANONYMOUS_PRODUCTION_READ_ONLY",
  ERP_PRODUCTION_READONLY_BASE_URL: "https://erp.example.test/next",
  ERP_PRODUCTION_READONLY_EXPECTED_HOSTNAME: "erp.example.test",
});

test("2Q4C: consent and strict production URL guard run before network requests", () => {
  for (const change of [
    { ERP_PRODUCTION_READONLY_CONSENT: "" },
    { ERP_PRODUCTION_READONLY_CONSENT: "yes" },
    { ERP_PRODUCTION_READONLY_BASE_URL: "http://erp.example.test/next" },
    { ERP_PRODUCTION_READONLY_BASE_URL: "https://erp.example.test:8443/next" },
    { ERP_PRODUCTION_READONLY_BASE_URL: "https://erp.example.test/next/orders" },
    { ERP_PRODUCTION_READONLY_BASE_URL: "https://erp.example.test/next?token=abc" },
    { ERP_PRODUCTION_READONLY_BASE_URL: "https://user:pass@erp.example.test/next" },
    { ERP_PRODUCTION_READONLY_EXPECTED_HOSTNAME: "other.example.test" },
  ]) assert.throws(() => parseProductionReadOnlyConfig({ ...valid(), ...change }));
});

test("2Q4C: explicit narrow allowlist contains only protected GET endpoints", () => {
  const checks = buildProductionReadOnlyChecks();
  assert.equal(checks.length, 5);
  for (const { path } of checks) {
    assert.match(path, /^\/api\/(orders\/(requested|current)\/paged-summary\?limit=1|expenses\/types|stock\/columns|users-center\/directory)$/);
    assert.doesNotMatch(path, /delete|archive|upload|mutation|export/);
  }
  const from = (route) => readFileSync(new URL(`../app/api/${route}/route.js`, import.meta.url), "utf8");
  for (const route of ["orders/requested/paged-summary", "orders/current/paged-summary", "expenses/types", "stock/columns", "users-center/directory"]) {
    const content = from(route);
    assert.match(content, /export async function GET\(/);
    assert.match(content, /(featureGate\(|getDirectAccountGate\(|getLegacyAccountGate\()/);
  }
});

test("2Q4C: forbidden requests pass; requests have no cookie, token, redirect or body", async () => {
  const config = parseProductionReadOnlyConfig(valid());
  const seen = [];
  const result = await runProductionReadOnlyChecks(config, {
    fetchImpl: async (url, options) => {
      seen.push({ url, options });
      return { status: 403, json: () => { throw new Error("Never read response bodies"); } };
    },
  });
  assert.equal(result.passed, 5);
  assert.equal(result.failed, 0);
  assert.equal(result.blocked, 0);
  assert.equal(seen.length, 5);
  for (const { url, options } of seen) {
    assert.ok(url.startsWith("https://erp.example.test/next/api/"));
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "manual");
    assert.equal(options.cache, "no-store");
    assert.equal(options.body, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.headers.Authorization, undefined);
  }
});

test("2Q4C: a successful anonymous request is FAIL and cannot be marked secure", async () => {
  const results = await runProductionReadOnlyChecks(parseProductionReadOnlyConfig(valid()), {
    fetchImpl: async () => ({ status: 200 }),
  });
  assert.equal(results.failed, 5);
  assert.equal(results.passed, 0);
});

test("2Q4C: redirect, missing endpoint, outage and network exceptions are inconclusive, not passes", async () => {
  for (const status of [301, 302, 404, 429, 500, 503]) {
    const results = await runProductionReadOnlyChecks(parseProductionReadOnlyConfig(valid()), {
      fetchImpl: async () => ({ status }),
    });
    assert.equal(results.blocked, 5);
    assert.equal(results.passed, 0);
  }
  const failedNetwork = await runProductionReadOnlyChecks(parseProductionReadOnlyConfig(valid()), {
    fetchImpl: async () => { throw new Error("SECRET=data"); },
  });
  assert.equal(failedNetwork.blocked, 5);
  assert.doesNotMatch(JSON.stringify(failedNetwork), /SECRET|data/);
});
