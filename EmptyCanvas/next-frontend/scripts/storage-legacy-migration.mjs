#!/usr/bin/env node
/**
 * Non-destructive migration preparation. NEVER updates database rows, changes
 * bucket visibility, or deletes public objects. Run from a trusted machine with
 * a server-side Supabase service-role key; generated manifests are confidential.
 *
 *  node scripts/storage-legacy-migration.mjs audit --out /secure/erp-inventory.json
 *  node scripts/storage-legacy-migration.mjs copy --manifest /secure/erp-inventory.json --out /secure/erp-copied.json --execute
 *  node scripts/storage-legacy-migration.mjs verify --manifest /secure/erp-copied.json
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIGRATION_SOURCES, encodedStoragePath, extractLegacyPublicUrls,
  mergeAuditHit, safeStoragePath, signedPrivateReference,
} from "../lib/legacy-storage-migration-policy.mjs";

const VERSION = 1;
const PAGE_SIZE = 250;
const MAX_ROWS_PER_TABLE = 25000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const usage = `Non-destructive ERP public-file migration planner (no DB updates or deletion)
  audit  --out ABSOLUTE_PATH [--max-rows N]
  copy   --manifest ABSOLUTE_PATH --out ABSOLUTE_PATH --execute
  verify --manifest ABSOLUTE_PATH
Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
             SUPABASE_STORAGE_BUCKET, ERP_STORAGE_PRIVATE_BUCKET,
             STORAGE_LINK_SECRET (or same session secret as the deployed app).
IMPORTANT: Store manifest files outside Git; they may contain private data.
After copy, database references STILL POINT TO PUBLIC FILES. Do not close
public storage until a separate reviewed reference-rewrite and validation.
`;

function cliError(message) { throw new Error(message); }
function argsFor(argv) {
  const [action, ...rest] = argv;
  if (["-h", "--help", "help", undefined].includes(action)) return { action: "help" };
  if (!["audit", "copy", "verify"].includes(action)) cliError(`Unknown action: ${action}`);
  const options = { action };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === "--execute") { options.execute = true; continue; }
    if (!["--out", "--manifest", "--max-rows"].includes(flag)) cliError(`Unknown option ${flag}`);
    if (!rest[i + 1] || rest[i + 1].startsWith("--")) cliError(`Missing ${flag} value`);
    options[flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = rest[++i];
  }
  if (action === "audit" && !options.out) cliError("Audit requires --out.");
  if (action === "copy" && (!options.out || !options.manifest || !options.execute)) cliError("Copy requires --manifest, --out, and explicit --execute.");
  if (action === "verify" && !options.manifest) cliError("Verify requires --manifest.");
  if (options.out && options.manifest && path.resolve(options.out) === path.resolve(options.manifest)) cliError("Never overwrite the source manifest.");
  return options;
}

function getConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const source = String(process.env.SUPABASE_STORAGE_BUCKET || process.env.SUPABASE_BUCKET || "operations-files").trim();
  const destination = String(process.env.ERP_STORAGE_PRIVATE_BUCKET || "").trim();
  if (!/^https:\/\/[^/]+$/.test(url) || !key) cliError("Set a trusted SUPABASE_URL and server-only SUPABASE_SERVICE_ROLE_KEY.");
  if (!/^[a-zA-Z0-9._-]{3,100}$/.test(source)) cliError("Invalid source Storage bucket.");
  if (destination && (!/^[a-zA-Z0-9._-]{3,100}$/.test(destination) || source === destination)) cliError("Private bucket must be different from the source bucket.");
  return { url, key, source, destination };
}

async function request(config, resource, { method = "GET", body, headers = {}, binary = false, notFoundOk = false } = {}) {
  const response = await fetch(`${config.url}${resource}`, {
    method,
    cache: "no-store",
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, ...headers },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404 && notFoundOk) return null;
  if (!response.ok) {
    const reason = await response.text().catch(() => "");
    // Never write authorization headers, signed URLs, or raw database values to logs.
    throw new Error(`${method} Storage/REST request failed: ${response.status} ${reason.slice(0, 160).replace(/[\r\n]/g, " ")}`);
  }
  if (binary) {
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_FILE_BYTES) cliError("Object exceeds the 20 MiB safe-copy limit; migrate it separately.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_FILE_BYTES) cliError("Object exceeds the 20 MiB safe-copy limit; migrate it separately.");
    return { bytes, type: response.headers.get("content-type") || "application/octet-stream" };
  }
  return response.json();
}

async function checkedPrivateBucket(config) {
  if (!config.destination) cliError("ERP_STORAGE_PRIVATE_BUCKET must be set for copy or verification.");
  const result = await request(config, `/storage/v1/bucket/${encodeURIComponent(config.destination)}`);
  if (result?.public !== false) cliError("Destination bucket is not private; refusing to copy.");
}

async function atomicPrivateJson(file, value) {
  const full = path.resolve(file);
  await fs.mkdir(path.dirname(full), { recursive: true });
  // All manifests contain record identifiers and URL paths. Restrict access.
  const temporary = `${full}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  await fs.rename(temporary, full);
  await fs.chmod(full, 0o600);
}

async function readManifest(location, sourceBucket) {
  const doc = JSON.parse(await fs.readFile(location, "utf8"));
  if (doc?.format !== "pyramakerz-storage-migration" || doc?.version !== VERSION || !Array.isArray(doc.objects)) cliError("Unknown manifest format.");
  if (doc.sourceBucket !== sourceBucket) cliError("Manifest source bucket does not match current configuration.");
  if (doc.objects.length > 50000) cliError("Manifest exceeds safe object count.");
  for (const row of doc.objects) {
    const scope = MIGRATION_SOURCES.find(s => s.scope === row.scope);
    if (!scope || row.sourceBucket !== sourceBucket || !safeStoragePath(row.sourcePath) || !row.sourcePath.startsWith(`${scope.prefix}/`)) {
      cliError("Manifest contains a path outside the allowed scope.");
    }
  }
  return doc;
}

async function audit(config, options) {
  const maxRows = Math.min(MAX_ROWS_PER_TABLE, Math.max(1, Number(options.maxRows || MAX_ROWS_PER_TABLE)));
  const records = new Map();
  const scan = [];
  for (const source of MIGRATION_SOURCES) {
    let count = 0;
    while (count < maxRows) {
      const limit = Math.min(PAGE_SIZE, maxRows - count);
      const columns = [source.id, ...source.columns];
      const query = new URLSearchParams({ select: columns.join(","), order: `${source.id}.asc`, limit: String(limit), offset: String(count) });
      const rows = await request(config, `/rest/v1/${encodeURIComponent(source.table)}?${query}`);
      if (!Array.isArray(rows)) cliError(`Unexpected records from table ${source.table}`);
      for (const row of rows) {
        for (const field of source.columns) {
          const matches = extractLegacyPublicUrls(row[field], { supabaseUrl: config.url, bucket: config.source, scope: source.scope });
          for (const item of matches) {
            mergeAuditHit(records, item, { table: source.table, recordId: String(row[source.id]), field, oldUrl: item.oldUrl });
          }
        }
      }
      count += rows.length;
      if (rows.length < limit) break;
    }
    if (count === maxRows) cliError(`The --max-rows limit was reached in ${source.table}. Increase it: do not trust an incomplete inventory.`);
    scan.push({ table: source.table, inspectedRows: count });
  }
  const manifest = {
    format: "pyramakerz-storage-migration", version: VERSION,
    stage: "audited-not-migrated", createdAt: new Date().toISOString(),
    sourceBucket: config.source, destinationBucket: config.destination || null,
    scan, objects: [...records.values()],
    caution: "No objects were copied; DB references and public access are unchanged.",
  };
  await atomicPrivateJson(options.out, manifest);
  console.log(`Audited ${scan.reduce((sum, s) => sum + s.inspectedRows, 0)} records, found ${manifest.objects.length} distinct legacy objects. Saved private manifest.`);
}

function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function objectUrl(bucket, objectPath, authenticated = true) {
  return `/storage/v1/object/${authenticated ? "authenticated/" : ""}${encodeURIComponent(bucket)}/${encodedStoragePath(objectPath)}`;
}

async function copy(config, options) {
  const original = await readManifest(options.manifest, config.source);
  if (!original.objects.length) cliError("Manifest is empty. No objects to migrate.");
  await checkedPrivateBucket(config);
  const secret = String(process.env.STORAGE_LINK_SECRET || process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!secret) cliError("STORAGE_LINK_SECRET (matching the application) is required for protected references.");
  const manifest = structuredClone(original);
  manifest.stage = "copied-unlinked";
  manifest.destinationBucket = config.destination;
  manifest.caution = "Objects have been copied, but database references still point to public originals. Never delete originals yet.";
  for (let i = 0; i < manifest.objects.length; i += 1) {
    const item = manifest.objects[i];
    if (item.state === "verified-copy" && item.destinationBucket === config.destination) continue;
    // Copy the exact source path inside the private bucket, preserving allowed prefix.
    const source = await request(config, objectUrl(config.source, item.sourcePath), { binary: true });
    const sha = sha256(source.bytes);
    const dest = objectUrl(config.destination, item.sourcePath);
    const existing = await request(config, dest, { binary: true, notFoundOk: true });
    if (!existing) {
      await request(config, `/storage/v1/object/${encodeURIComponent(config.destination)}/${encodedStoragePath(item.sourcePath)}`, {
        method: "POST", headers: { "Content-Type": source.type, "x-upsert": "false" }, body: source.bytes,
      });
    } else if (sha256(existing.bytes) !== sha) {
      cliError(`Refusing to replace a different object in the destination bucket (object ${i + 1}).`);
    }
    const verified = await request(config, dest, { binary: true });
    if (sha256(verified.bytes) !== sha) cliError(`Private copy verification failed for object ${i + 1}.`);
    const name = item.sourcePath.split("/").at(-1) || "Attachment";
    item.destinationBucket = config.destination;
    item.destinationPath = item.sourcePath;
    item.sha256 = sha;
    item.size = verified.bytes.length;
    item.state = "verified-copy";
    item.proposedProtectedUrl = signedPrivateReference({
      bucket: config.destination, path: item.sourcePath, name, type: source.type,
      size: verified.bytes.length, scope: item.scope, secret,
    });
    // Checkpoint after every verified copy to make interrupted runs recoverable.
    await atomicPrivateJson(options.out, manifest);
    console.log(`Verified private copy ${i + 1}/${manifest.objects.length}. No DB updates or deletes.`);
  }
}

async function verify(config, options) {
  const manifest = await readManifest(options.manifest, config.source);
  await checkedPrivateBucket(config);
  if (manifest.destinationBucket !== config.destination || manifest.stage !== "copied-unlinked") cliError("Expected a copied-unlinked manifest for the configured private bucket.");
  for (const [index, item] of manifest.objects.entries()) {
    if (item.state !== "verified-copy" || item.destinationBucket !== config.destination || item.destinationPath !== item.sourcePath || !item.sha256) cliError(`Item ${index + 1} has not been fully copied.`);
    const result = await request(config, objectUrl(config.destination, item.sourcePath), { binary: true });
    if (sha256(result.bytes) !== item.sha256) cliError(`Private copy checksum changed at item ${index + 1}.`);
  }
  console.log(`Verified ${manifest.objects.length} private copies. Public originals and database links still exist and remain unchanged.`);
}

async function main() {
  const options = argsFor(process.argv.slice(2));
  if (options.action === "help") { console.log(usage); return; }
  const config = getConfig();
  if (options.action === "audit") await audit(config, options);
  if (options.action === "copy") await copy(config, options);
  if (options.action === "verify") await verify(config, options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Migration stopped safely: ${error.message}`); process.exitCode = 1; });
}
