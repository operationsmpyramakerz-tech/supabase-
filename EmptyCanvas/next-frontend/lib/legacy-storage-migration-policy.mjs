/**
 * Pure helpers for an OFFLINE, non-destructive legacy storage migration.
 * Keep all scope and URL parsing rules here so they can be unit-tested without
 * Supabase credentials or importing any Next.js server-only module.
 */
import crypto from "node:crypto";

export const MIGRATION_SOURCES = Object.freeze([
  { scope: "task-management", table: "department_ticket_sections", id: "id", columns: ["ticket_id", "attachments", "attachment_url", "work_file_url"], prefix: "task-management/attachments" },
  { scope: "task-management", table: "department_ticket_section_assignments", id: "id", columns: ["section_id", "attachments", "attachment_url", "work_file_url"], prefix: "task-management/attachments" },
  { scope: "b2c", table: "b2c_customers", id: "id", columns: ["database_id", "data"], prefix: "b2c/customer-files" },
  { scope: "kpi-evidence", table: "kpi_employee_scores", id: "id", columns: ["review_id", "evidence_text"], prefix: "kpi-evidence" },
]);

export function encodedStoragePath(path) {
  return String(path || "").split("/").map(encodeURIComponent).join("/");
}

export function safeStoragePath(path) {
  const parts = String(path || "").replace(/^\/+/, "").split("/");
  if (!parts.length || parts.some(part => !part || part === "." || part === ".." || /[\\\x00-\x1f]/.test(part))) return false;
  return true;
}

export function extractLegacyPublicUrls(value, { supabaseUrl, bucket, scope } = {}) {
  const base = String(supabaseUrl || "").trim().replace(/\/+$/, "");
  const expectedBucket = String(bucket || "").trim();
  const source = MIGRATION_SOURCES.find(row => row.scope === scope);
  if (!base || !expectedBucket || !source) return [];
  const content = (typeof value === "string" ? value : JSON.stringify(value ?? "")).replace(/\\\//g, "/");
  const matches = content.match(/https?:\/\/[^\s"'<>()[\]{}\\]+/g) || [];
  const urls = [];
  for (let raw of matches) {
    raw = raw.replace(/[.,;]+$/, "");
    let url;
    try { url = new URL(raw); } catch { continue; }
    if (url.origin !== new URL(base).origin) continue;
    const marker = "/storage/v1/object/public/";
    if (!url.pathname.startsWith(marker)) continue;
    const suffix = url.pathname.slice(marker.length);
    const slash = suffix.indexOf("/");
    if (slash < 0) continue;
    let bucketPart, path;
    try {
      bucketPart = decodeURIComponent(suffix.slice(0, slash));
      path = suffix.slice(slash + 1).split("/").map(decodeURIComponent).join("/");
    } catch { continue; }
    if (bucketPart !== expectedBucket || !safeStoragePath(path)) continue;
    if (!path.startsWith(`${source.prefix}/`)) continue;
    urls.push({ oldUrl: raw, sourceBucket: expectedBucket, sourcePath: path, scope });
  }
  return [...new Map(urls.map(item => [`${item.sourceBucket}\0${item.sourcePath}`, item])).values()];
}

export function migrationObjectKey(item) {
  return `${item.scope}\0${item.sourceBucket}\0${item.sourcePath}`;
}

export function mergeAuditHit(byKey, item, association) {
  const key = migrationObjectKey(item);
  let record = byKey.get(key);
  if (!record) {
    record = { ...item, associations: [], state: "planned" };
    byKey.set(key, record);
  }
  if (!record.associations.some(value => value.table === association.table && value.recordId === association.recordId && value.field === association.field && value.oldUrl === association.oldUrl)) {
    record.associations.push(association);
  }
  return record;
}

export function signedPrivateReference({ bucket, path, name, type, size, scope, secret }) {
  if (!secret || !bucket || !safeStoragePath(path)) throw new Error("Storage secret, bucket and valid object path are required.");
  const payload = {
    v: 1, kind: "file", bucket, path,
    name: String(name || "Attachment").replace(/[\r\n\0]/g, "").trim().slice(0, 500) || "Attachment",
    type: String(type || "application/octet-stream").replace(/[\r\n\0]/g, "").trim().slice(0, 180) || "application/octet-stream",
    size: Math.max(0, Number(size) || 0), scope, recordAuthRequired: true,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const reference = `${encoded}.${signature}`;
  return `/next/api/storage/file-direct?${new URLSearchParams({ reference, name: payload.name })}`;
}
