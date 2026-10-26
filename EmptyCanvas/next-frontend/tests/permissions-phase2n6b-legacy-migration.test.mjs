import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MIGRATION_SOURCES, extractLegacyPublicUrls, mergeAuditHit,
  safeStoragePath, signedPrivateReference,
} from "../lib/legacy-storage-migration-policy.mjs";

const config = { supabaseUrl: "https://example.supabase.co", bucket: "operations-files" };

test("public storage audit only admits the configured origin, bucket and scope prefix", () => {
  const raw = JSON.stringify({
    files: [
      "https://example.supabase.co/storage/v1/object/public/operations-files/b2c/customer-files/client%20photo.png",
      "https://other.supabase.co/storage/v1/object/public/operations-files/b2c/customer-files/leak.png",
      "https://example.supabase.co/storage/v1/object/public/another-bucket/b2c/customer-files/no.png",
      "https://example.supabase.co/storage/v1/object/public/operations-files/task-management/attachments/not-b2c.png",
    ],
  });
  const result = extractLegacyPublicUrls(raw, { ...config, scope: "b2c" });
  assert.equal(result.length, 1);
  assert.equal(result[0].sourcePath, "b2c/customer-files/client photo.png");
});

test("rejects dot segments, encoded slashes across segments and arbitrary paths", () => {
  assert.equal(safeStoragePath("b2c/customer-files/../private"), false);
  assert.equal(safeStoragePath("b2c/customer-files/"), false);
  assert.equal(safeStoragePath("b2c\\customer-files/file"), false);
  assert.deepEqual(extractLegacyPublicUrls("https://example.supabase.co/storage/v1/object/public/operations-files/b2c/customer-files/%2E%2E/secret", { ...config, scope: "b2c" }), []);
});

test("deduplicates objects but retains exact parent record associations", () => {
  const found = new Map();
  const item = { scope: "b2c", sourceBucket: "operations-files", sourcePath: "b2c/customer-files/x.jpg", oldUrl: "url" };
  mergeAuditHit(found, item, { table: "b2c_customers", recordId: "2", field: "data", oldUrl: "url" });
  mergeAuditHit(found, item, { table: "b2c_customers", recordId: "2", field: "data", oldUrl: "url" });
  mergeAuditHit(found, item, { table: "b2c_customers", recordId: "3", field: "data", oldUrl: "url" });
  assert.equal(found.size, 1);
  assert.equal([...found.values()][0].associations.length, 2);
});

test('audit retains multiple legacy URLs to the same storage object for complete reference cutover', () => {
  const first = 'https://example.supabase.co/storage/v1/object/public/operations-files/b2c/customer-files/x.jpg';
  const second = `${first}?download=1`;
  const matches = extractLegacyPublicUrls(JSON.stringify({ files: [{ url: first }, { url: second }] }), { ...config, scope: 'b2c' });
  assert.equal(matches.length, 2);
  const map = new Map();
  for (const match of matches) mergeAuditHit(map, match, { table: 'b2c_customers', recordId: '123', field: 'data', oldUrl: match.oldUrl });
  assert.equal(map.size, 1);
  assert.equal([...map.values()][0].associations.length, 2);
});

test("proposed protected references use the application's HMAC layout and remain record-bound", () => {
  const url = signedPrivateReference({ bucket: "erp-private-files", path: "kpi-evidence/a.pdf", name: "a.pdf", type: "application/pdf", size: 99, scope: "kpi-evidence", secret: "local-test-secret" });
  const reference = new URL(url, "https://erp.example").searchParams.get("reference");
  const [encoded, signature] = reference.split(".");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assert.equal(payload.recordAuthRequired, true);
  assert.equal(payload.bucket, "erp-private-files");
  assert.equal(crypto.createHmac("sha256", "local-test-secret").update(encoded).digest("base64url"), signature);
});

test("inventory covers the known record-bearing tables only", () => {
  assert.deepEqual(MIGRATION_SOURCES.map(source => source.table), ["department_ticket_sections", "department_ticket_section_assignments", "b2c_customers", "kpi_employee_scores"]);
});

test("CLI cannot copy without explicit execution and manifest output", () => {
  const cli = new URL("../scripts/storage-legacy-migration.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [cli.pathname, "copy"], { encoding: "utf8", env: {} });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit --execute/);
});

test("CLI remains non-destructive and does not mutate any DB rows", () => {
  const source = readFileSync(new URL("../scripts/storage-legacy-migration.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /method:\s*["'](?:DELETE|PATCH)["']/);
  assert.doesNotMatch(source, /storage\/v1\/object\/move/);
  assert.match(source, /stage = "copied-unlinked"/);
});
