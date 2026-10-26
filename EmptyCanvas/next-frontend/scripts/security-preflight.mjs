#!/usr/bin/env node
/** Read-only deployment readiness check. Prints no secret values. */
import { pathToFileURL } from "node:url";
import { sessionSigningStatus } from "../lib/session-signing-secret.mjs";

const privateModules = [
  ["Task Management", "ERP_STORAGE_TASK_PRIVATE_UPLOADS_ENABLED", "ERP_STORAGE_TASK_RECORD_AUTH_ENABLED"],
  ["B2C", "ERP_STORAGE_B2C_PRIVATE_UPLOADS_ENABLED", "ERP_STORAGE_B2C_RECORD_AUTH_ENABLED"],
  ["KPI Evidence", "ERP_STORAGE_KPI_PRIVATE_UPLOADS_ENABLED", "ERP_STORAGE_KPI_RECORD_AUTH_ENABLED"],
];

export function deploymentSecurityPreflight(env = process.env, { production = true } = {}) {
  const errors = [];
  const warnings = [];
  const defined = name => Boolean(String(env[name] || "").trim());
  const flag = name => String(env[name] || "").trim() === "1";
  const signing = sessionSigningStatus({ ...env, NODE_ENV: production ? "production" : "development" });
  if (!signing.ok) errors.push(signing.message);
  else if (signing.warning) warnings.push(signing.warning);

  if (!/^https:\/\//i.test(String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim())) {
    errors.push("SUPABASE_URL must be configured with HTTPS.");
  }
  const hasServiceCredential = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY"].some(defined);
  if (flag("ERP_ADVANCED_PERMISSIONS_ENABLED") && !hasServiceCredential) {
    errors.push("Advanced permissions require a server-side Supabase service credential.");
  }
  if (!hasServiceCredential) {
    warnings.push("No Supabase service credential detected; confirm that server-side RLS operations are available.");
  }
  if (!defined("UPSTASH_REDIS_URL") && !defined("REDIS_URL") && !(defined("UPSTASH_REDIS_REST_URL") && defined("UPSTASH_REDIS_REST_TOKEN"))) {
    errors.push("Session store is not configured (Redis URL or Upstash REST URL and token required).");
  }
  const publicBucket = String(env.SUPABASE_STORAGE_BUCKET || env.SUPABASE_BUCKET || "operations-files").trim();
  const privateBucket = String(env.ERP_STORAGE_PRIVATE_BUCKET || "").trim();
  for (const [name, uploadsFlag, authFlag] of privateModules) {
    if (flag(uploadsFlag) && !flag(authFlag)) {
      errors.push(`${name} private uploads require ${authFlag}=1 before rollout.`);
    }
    if (flag(uploadsFlag) || flag(authFlag)) {
      if (!/^[a-zA-Z0-9._-]{3,100}$/.test(privateBucket) || privateBucket.toLowerCase() === publicBucket.toLowerCase()) {
        errors.push(`${name} protected storage requires ERP_STORAGE_PRIVATE_BUCKET different from the public bucket.`);
      }
    }
    if (!flag(authFlag) && !flag(uploadsFlag)) {
      warnings.push(`${name}: private Storage/record authorization is not enabled. Confirm the planned migration status.`);
    }
  }
  if (production && !defined("FORCE_SECURE_COOKIE")) {
    warnings.push("Set FORCE_SECURE_COOKIE=true behind the HTTPS reverse proxy; verify the proxy forwards HTTPS correctly.");
  }
  if (defined("FORCE_SECURE_COOKIE") && String(env.FORCE_SECURE_COOKIE).toLowerCase() !== "true") {
    warnings.push("FORCE_SECURE_COOKIE is not true; secure cookies depend on proxy forwarding.");
  }
  if (!defined("STORAGE_LINK_SECRET")) {
    warnings.push("Use a dedicated STORAGE_LINK_SECRET for storage references (avoid sharing the session key).");
  }
  return { ok: errors.length === 0, errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = deploymentSecurityPreflight(process.env, { production: !process.argv.includes("--development") });
  console.log(`ERP security preflight: ${report.ok ? "PASS" : "FAIL"}`);
  for (const message of report.errors) console.error(`ERROR: ${message}`);
  for (const message of report.warnings) console.warn(`WARNING: ${message}`);
  // Never print credential contents or session tokens.
  if (!report.ok) process.exitCode = 1;
}
