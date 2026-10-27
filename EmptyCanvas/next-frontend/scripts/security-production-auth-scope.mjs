#!/usr/bin/env node
// Must be explicitly run by an authorized operator. No cookies or record data logged.
import {
  parseProductionAuthScopeConfig, parseProductionAuthScopeCookies,
  runProductionAuthScopeChecks,
} from "../lib/production-auth-scope-probe.mjs";

let config, cookies;
try {
  config = parseProductionAuthScopeConfig(process.env);
  cookies = parseProductionAuthScopeCookies(process.env);
} catch (error) {
  console.error(`[2Q4D] BLOCKED before network requests: ${error.message}`);
  process.exitCode = 2;
}
if (config && cookies) {
  const results = await runProductionAuthScopeChecks(config, cookies);
  for (const row of results.checks) {
    console.log(`${row.result.padEnd(7)} ${row.check.padEnd(33)} HTTP ${String(row.status ?? "-").padStart(3)} (${row.reason})`);
  }
  console.log(`[2Q4D] ${results.passed} PASS / ${results.failed} FAIL / ${results.blocked} BLOCKED. Authenticated GET only; no mutations or data output.`);
  if (results.failed || results.blocked) process.exitCode = 1;
}
