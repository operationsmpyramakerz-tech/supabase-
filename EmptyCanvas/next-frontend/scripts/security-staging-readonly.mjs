#!/usr/bin/env node
// No secrets are read from or written to disk. Do not paste cookies into chats.
import { parseStagingProbeConfig, runStagingReadOnlyProbes } from "../lib/staging-permissions-probe.mjs";

let config;
try {
  config = parseStagingProbeConfig(process.env);
} catch (error) {
  console.error(`[2Q4B] Blocked before any network request: ${error.message}`);
  process.exitCode = 2;
}

if (config) {
  const results = await runStagingReadOnlyProbes(config);
  for (const { check, result, status, reason } of results.checks) {
    console.log(`${result.padEnd(7)} ${check.padEnd(28)} HTTP ${String(status ?? "-").padStart(3)} (${reason})`);
  }
  console.log(`[2Q4B] ${results.passed} passed / ${results.failed} failed / ${results.blocked} blocked. READ-ONLY, no mutations executed.`);
  if (results.failed || results.blocked) process.exitCode = 1;
}
