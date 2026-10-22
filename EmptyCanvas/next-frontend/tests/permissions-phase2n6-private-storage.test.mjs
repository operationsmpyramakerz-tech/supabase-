import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveUploadBucket } from "../lib/private-upload-policy.mjs";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");
const legacy = "operations-files";

for (const scope of ["task-management", "b2c", "kpi-evidence"]) {
  const code = { "task-management": "TASK", b2c: "B2C", "kpi-evidence": "KPI" }[scope];
  const uploads = `ERP_STORAGE_${code}_PRIVATE_UPLOADS_ENABLED`;
  const reads = `ERP_STORAGE_${code}_RECORD_AUTH_ENABLED`;
  test(`Phase 2N6: ${scope} stays in its original bucket when private mode is off`, () => {
    assert.deepEqual(resolveUploadBucket(scope, legacy, {}), { bucket: legacy, privateMode: false });
  });
  test(`Phase 2N6: ${scope} requires record authorization for private writes`, () => {
    assert.throws(() => resolveUploadBucket(scope, legacy, { [uploads]: "1", ERP_STORAGE_PRIVATE_BUCKET: "erp-private-files" }), { code: "PRIVATE_STORAGE_CONFIGURATION_ERROR", status: 503 });
  });
  test(`Phase 2N6: ${scope} cannot reuse the public bucket`, () => {
    assert.throws(() => resolveUploadBucket(scope, legacy, { [uploads]: "1", [reads]: "1", ERP_STORAGE_PRIVATE_BUCKET: legacy }), { code: "PRIVATE_STORAGE_CONFIGURATION_ERROR" });
  });
  test(`Phase 2N6: ${scope} uses the private bucket only when all prerequisites are set`, () => {
    assert.deepEqual(resolveUploadBucket(scope, legacy, { [uploads]: "1", [reads]: "1", ERP_STORAGE_PRIVATE_BUCKET: "erp-private-files" }), { bucket: "erp-private-files", privateMode: true });
  });
}

test("Phase 2N6: missing or malformed bucket fails closed", () => {
  for (const bucket of ["", "operations/files", " bad bucket "]) {
    assert.throws(() => resolveUploadBucket("b2c", legacy, {
      ERP_STORAGE_B2C_PRIVATE_UPLOADS_ENABLED: "1",
      ERP_STORAGE_B2C_RECORD_AUTH_ENABLED: "1",
      ERP_STORAGE_PRIVATE_BUCKET: bucket,
    }), { code: "PRIVATE_STORAGE_CONFIGURATION_ERROR" });
  }
  assert.throws(() => resolveUploadBucket("unexpected", legacy, {}), { code: "PRIVATE_STORAGE_CONFIGURATION_ERROR" });
});

test("Phase 2N6: storage bucket is verified private on the server before signed PUT", () => {
  const rest = source("../lib/supabase-rest.js");
  assert.match(rest, /\/storage\/v1\/bucket\/\$\{encodeURIComponent\(bucket\)\}/);
  assert.match(rest, /metadata\.public !== false/);
  assert.match(rest, /verifiedPrivateBuckets\.set\(bucket, now \+ 30_000\)/);
  for (const path of [
    "../lib/storage-direct.js",
    "../app/api/task-management/upload-direct/route.js",
    "../app/api/b2c/upload-ticket/route.js",
    "../app/api/kpis/evidence-upload/route.js",
  ]) {
    const code = source(path);
    assert.match(code, /resolveUploadBucket\(/, path);
    assert.match(code, /await assertPrivateStorageBucket\(/, path);
    assert.ok(code.indexOf("await assertPrivateStorageBucket(") < code.indexOf("await createSignedUploadUrl(") || !code.includes("createSignedUploadUrl("), path);
  }
});

test("Phase 2N6: private object links permanently enforce live record-level authorization", () => {
  const direct = source("../lib/storage-direct.js");
  const file = source("../app/api/storage/file-direct/route.js");
  assert.match(direct, /recordAuthRequired: selected\.privateMode/);
  assert.match(direct, /recordAuthRequired: payload\.recordAuthRequired === true/);
  assert.match(file, /const bound = payload\.recordAuthRequired === true/);
  assert.match(file, /bound \|\| process\.env\.ERP_STORAGE_TASK_RECORD_AUTH_ENABLED/);
  assert.match(file, /bound \|\| process\.env\.ERP_STORAGE_B2C_RECORD_AUTH_ENABLED/);
  assert.match(file, /bound \|\| process\.env\.ERP_STORAGE_KPI_RECORD_AUTH_ENABLED/);
  assert.match(file, /cache: !recordAuth/);
});

test("Phase 2N6: fallback Task upload cannot silently put private files in public storage", () => {
  const legacy = source("../app/api/task-management/upload-direct/route.js");
  assert.match(legacy, /resolveUploadBucket\("task-management"/);
  assert.match(legacy, /bucketName: selected\.bucket/);
  assert.match(legacy, /recordAuthRequired: true/);
  assert.match(legacy, /selected\.privateMode \? fileUrl\(reference, filename\) : uploaded\.publicUrl/);
});

test("Phase 2N6: migration SQL creates a non-public bucket and does not alter legacy objects", () => {
  const sql = source("../sql/ERP_Phase2N6_Private_Storage_Bucket.sql");
  assert.match(sql, /storage\.buckets/);
  assert.match(sql, /'erp-private-files'/);
  assert.match(sql, /false/);
  assert.doesNotMatch(sql, /UPDATE\s+storage\.objects|DELETE\s+FROM\s+storage\.objects/i);
  assert.doesNotMatch(sql, /CREATE\s+POLICY.*public/i);
});
