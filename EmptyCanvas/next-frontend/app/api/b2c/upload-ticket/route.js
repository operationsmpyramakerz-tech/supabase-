import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { directB2cContext } from "../../../../lib/b2c-data";
import { featureAllowed } from "../../../../lib/feature-permissions-registry";
import { assertPrivateStorageBucket, createSignedUploadUrl, getSupabaseConfig } from "../../../../lib/supabase-rest";
import { resolveUploadBucket } from "../../../../lib/private-upload-policy.mjs";
import { createFileReference, fileUrl } from "../../../../lib/storage-direct";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

function text(value, max = 0) {
  const out = String(value ?? "").trim();
  return max > 0 ? out.slice(0, max) : out;
}
function safeName(value) {
  return (text(value, 240) || "attachment").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment";
}
function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const context = await directB2cContext(["Customer Database", "Customer Form", "B2C"], { mutation: true }).catch(() => null);
  if (!context) return json({ ok: false, error: "Direct B2C access is unavailable." }, 503);
  if (!context.ok) return json({ ok: false, error: context.error || "B2C access denied." }, context.status || 403);
  if (!featureAllowed(context.account, "b2c.forms.submit") && !featureAllowed(context.account, "b2c.database.record_edit"))
    return json({ ok: false, error: "Permission to upload customer files is not allowed." }, 403);

  try {
    const body = await request.json().catch(() => ({}));
    const filename = text(body?.filename || body?.name, 240) || "attachment";
    const mime = text(body?.mime || body?.type, 160) || "application/octet-stream";
    const size = Math.max(0, Number(body?.size) || 0);
    if (!size) return json({ ok: false, error: "Choose a valid photo or file first." }, 400);
    if (size > MAX_BYTES) return json({ ok: false, error: "Each file must be 10 MB or less." }, 413);

    const objectPath = `b2c/customer-files/${Date.now()}-${crypto.randomUUID()}-${safeName(filename)}`;
    const selected = resolveUploadBucket("b2c", getSupabaseConfig().storageBucket);
    if (selected.privateMode) await assertPrivateStorageBucket(selected.bucket);
    const ticket = await createSignedUploadUrl(objectPath, { bucketName: selected.bucket });
    const protectedMode = process.env.ERP_STORAGE_B2C_RECORD_AUTH_ENABLED === "1";
    const reference = protectedMode ? createFileReference({
      bucket: ticket.bucket, path: ticket.path, name: filename, type: mime, size, scope: "b2c", recordAuthRequired: selected.privateMode,
    }) : "";
    const customerFileUrl = protectedMode ? fileUrl(reference, filename) : ticket.publicUrl;
    return json({
      ok: true,
      file: { name: filename, url: customerFileUrl, type: mime, size },
      upload: {
        method: "PUT",
        signedUrl: ticket.signedUrl,
        ...(protectedMode ? {} : { publicUrl: ticket.publicUrl }),
        headers: { "x-upsert": "false" },
        bucket: ticket.bucket,
        path: ticket.path,
      },
      source: "supabase-next",
    });
  } catch (error) {
    console.error("POST /next/api/b2c/upload-ticket error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to prepare the B2C upload." }, Number(error?.status) || 500);
  }
}
