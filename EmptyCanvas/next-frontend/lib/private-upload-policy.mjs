/**
 * Explicit, fail-closed private uploads. Scope flags are independent so a
 * deployment can migrate one module at a time without touching legacy files.
 * This module intentionally has no framework or environment side effects.
 */
const SCOPES = Object.freeze({
  "task-management": ["ERP_STORAGE_TASK_PRIVATE_UPLOADS_ENABLED", "ERP_STORAGE_TASK_RECORD_AUTH_ENABLED"],
  b2c: ["ERP_STORAGE_B2C_PRIVATE_UPLOADS_ENABLED", "ERP_STORAGE_B2C_RECORD_AUTH_ENABLED"],
  "kpi-evidence": ["ERP_STORAGE_KPI_PRIVATE_UPLOADS_ENABLED", "ERP_STORAGE_KPI_RECORD_AUTH_ENABLED"],
});

function configurationError(message) {
  const error = new Error(message);
  error.code = "PRIVATE_STORAGE_CONFIGURATION_ERROR";
  error.status = 503;
  return error;
}

export function resolveUploadBucket(scope, legacyBucket, env = process.env) {
  const switches = SCOPES[String(scope || "").trim().toLowerCase()];
  const publicBucket = String(legacyBucket || "").trim();
  if (!switches) throw configurationError("Unsupported private storage scope.");
  if (env[switches[0]] !== "1") return { bucket: publicBucket, privateMode: false };
  if (env[switches[1]] !== "1") {
    throw configurationError("Private file uploads require record-level download authorization to be enabled first.");
  }
  const privateBucket = String(env.ERP_STORAGE_PRIVATE_BUCKET || "").trim();
  if (!privateBucket || !/^[a-zA-Z0-9._-]{3,100}$/.test(privateBucket)) {
    throw configurationError("Configure a valid ERP_STORAGE_PRIVATE_BUCKET before enabling private uploads.");
  }
  if (privateBucket.toLowerCase() === publicBucket.toLowerCase()) {
    throw configurationError("Private and legacy storage buckets must be different.");
  }
  return { bucket: privateBucket, privateMode: true };
}
