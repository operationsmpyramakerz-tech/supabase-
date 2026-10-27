import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { b2cRecordHasReference, kpiEvidenceHasReference, storedReference } from "../lib/storage-record-file-policy.mjs";

const reference = `${"A".repeat(64)}.${"B".repeat(43)}`;
const link = `/next/api/storage/file-direct?reference=${reference}&name=example.pdf`;

test("exact B2C customer file reference, not just a JSON substring", () => {
  assert.equal(b2cRecordHasReference({ files: [{ name: "example", url: link }] }, reference), true);
  assert.equal(b2cRecordHasReference({ files: [{ name: "example", url: `/next/api/storage/file-direct?reference=${reference}&name=other.pdf` }] }, reference), true);
  assert.equal(b2cRecordHasReference({ files: [{ url: `/next/api/storage/file-direct?reference=${reference}x` }] }, reference), false);
  assert.equal(b2cRecordHasReference({ notes: `/${reference}/`, files: [] }, reference), false);
});

test("KPI evidence must match an exact stored direct reference", () => {
  assert.equal(kpiEvidenceHasReference(link, reference), true);
  assert.equal(kpiEvidenceHasReference(`https://example.com/anything?reference=${reference}`, reference), false);
  assert.equal(kpiEvidenceHasReference(`/next/api/storage/file-direct?reference=${reference}x`, reference), false);
});

test("refuse external hosts and mixed references", () => {
  assert.equal(storedReference(`https://evil.example/next/api/storage/file-direct?reference=${reference}`), "");
  assert.equal(storedReference("https://supabase.example/storage/public/b2c.pdf"), "");
  assert.equal(storedReference(link), reference);
});

test("B2C and KPI downloads require live record access behind independent flags", () => {
  const route = fs.readFileSync(new URL("../app/api/storage/file-direct/route.js", import.meta.url), "utf8");
  assert.match(route, /ERP_STORAGE_B2C_RECORD_AUTH_ENABLED/);
  assert.match(route, /ERP_STORAGE_KPI_RECORD_AUTH_ENABLED/);
  assert.match(route, /assertB2cStorageRecordAccess\(reference\)/);
  assert.match(route, /assertKpiStorageRecordAccess\(reference\)/);
  assert.match(route, /cache: !recordAuth/);
});

test("new B2C and KPI uploads can return record-checked URLs without exposing publicUrl", () => {
  const b2c = fs.readFileSync(new URL("../app/api/b2c/upload-ticket/route.js", import.meta.url), "utf8");
  const kpi = fs.readFileSync(new URL("../app/api/kpis/evidence-upload/route.js", import.meta.url), "utf8");
  assert.match(b2c, /protectedMode \? fileUrl\(reference/);
  assert.match(kpi, /protectedMode \? fileUrl\(reference/);
  assert.match(b2c, /protectedMode \? \{\} : \{ publicUrl/);
});

test("KPI file reads refuse same-name fallback for view-only users", () => {
  const access = fs.readFileSync(new URL("../lib/storage-b2c-kpi-record-access.js", import.meta.url), "utf8");
  assert.match(access, /context\.accessLevel === "view"/);
  assert.match(access, /viewerId !== reviewedId/);
  assert.doesNotMatch(access, /sameMember\(/);
});
