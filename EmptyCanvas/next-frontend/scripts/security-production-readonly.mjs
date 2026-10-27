#!/usr/bin/env node
// Safe on production: five unauthenticated GET checks, no response-body reads, no changes.
import { parseProductionReadOnlyConfig, runProductionReadOnlyChecks } from "../lib/production-readonly-probe.mjs";

let config;
try {
  config = parseProductionReadOnlyConfig(process.env);
} catch (error) {
  console.error(`[2Q4C] Blocked before any network request: ${error.message}`);
  process.exitCode = 2;
}
if (config) {
  const result = await runProductionReadOnlyChecks(config);
  for (const row of result.checks) {
    console.log(`${row.result.padEnd(7)} ${row.check.padEnd(30)} HTTP ${String(row.status ?? "-").padStart(3)} (${row.reason})`);
  }
  console.log(`[2Q4C] ${result.passed} PASS / ${result.failed} FAIL / ${result.blocked} BLOCKED. Anonymous GET only; no mutations or cookies.`);
  if (result.failed || result.blocked) process.exitCode = 1;
}
