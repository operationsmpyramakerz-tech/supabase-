#!/usr/bin/env node
// Must be explicitly run by an authorized operator. No cookies or record data logged.
import {
  parseProductionAuthScopeConfig, parseProductionAuthScopeCookies,
  runProductionAuthScopeChecks,
} from "../lib/production-auth-scope-probe.mjs";

const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  console.log(`Production authenticated permission audit (GET only).

  npm run security:production-auth-scope -- --help
  npm run security:production-auth-scope -- --check-config
  npm run security:production-auth-scope

--check-config validates the production URL, consent and 3 existing order
numbers only. It reads NO cookies and sends NO network requests.
The full command requires 4 explicitly authorized distinct account sessions
(DENIED / OWN / TEAM / ALL). Do not paste cookies into chat, screenshots or Git.
Follow SECURITY_AUDIT_PHASE_2Q4D_PRODUCTION_AUTH_SCOPE.md.
No test action changes the ERP database or permissions.`);
} else if (args.has("--check-config")) {
  try {
    parseProductionAuthScopeConfig(process.env);
    console.log("[2Q4D] Configuration PASS: approved Production URL, consent and order references valid. No cookies read; no requests sent.");
  } catch (error) {
    console.error(`[2Q4D] Configuration BLOCKED: ${error.message}. No cookies read; no requests sent.`);
    process.exitCode = 2;
  }
} else if (args.size > 0) {
  console.error("[2Q4D] Unknown option; use --help. No requests sent.");
  process.exitCode = 2;
} else {
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
}
