import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { directTaskManagementContext } from "../../../../lib/task-management-data";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { assertPrivateStorageBucket, getSupabaseConfig, uploadStorageObject } from "../../../../lib/supabase-rest";
import { resolveUploadBucket } from "../../../../lib/private-upload-policy.mjs";
import { createFileReference, fileUrl } from "../../../../lib/storage-direct";
import { parseDirectAttachmentDataUrl } from "../../../../lib/direct-attachment-upload-policy.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}
function text(value, max = 0) {
  const out = String(value ?? "").trim();
  return max > 0 ? out.slice(0, max) : out;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const url = new URL(request.url);
  const view = text(body?.view || url.searchParams.get("view")).toLowerCase();
  const context = await directTaskManagementContext(view);
  if (!context?.ok) return json({ ok: false, error: context?.error || "Task Management access denied." }, context?.status || 503);
  const uploadGate = featureGate(context, "tasks.attachment_upload");
  if (!uploadGate.ok) return json({ ok: false, error: uploadGate.error }, uploadGate.status || 403);

  try {
    const dataUrl = body?.dataUrl || body?.data;
    const filename = text(body?.filename || body?.name, 500) || "attachment";
    const mimeHint = text(body?.mime || body?.type, 180);
    // Validate the encoded length and alphabet BEFORE allocating the decoded
    // Buffer. Node's permissive Base64 decoder must not silently accept junk.
    const { bytes, contentType } = parseDirectAttachmentDataUrl(dataUrl, {
      maxBytes: 10 * 1024 * 1024,
      mimeHint,
    });
    const cleanName = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment";
    const objectPath = `task-management/attachments/${Date.now()}-${crypto.randomUUID()}-${cleanName}`;
    const selected = resolveUploadBucket("task-management", getSupabaseConfig().storageBucket);
    if (selected.privateMode) await assertPrivateStorageBucket(selected.bucket);
    const uploaded = await uploadStorageObject(objectPath, bytes, { contentType, upsert: false, bucketName: selected.bucket });
    if (!uploaded?.path) throw new Error("Supabase Storage did not confirm the attachment upload.");
    const reference = selected.privateMode ? createFileReference({
      bucket: selected.bucket, path: objectPath, name: filename, type: contentType,
      size: bytes.length, scope: "task-management", recordAuthRequired: true,
    }) : "";
    return json({
      ok: true,
      file: { name: filename, url: selected.privateMode ? fileUrl(reference, filename) : uploaded.publicUrl, type: contentType, size: bytes.length },
      source: "supabase-next",
    }, 201);
  } catch (error) {
    console.error("POST /next/api/task-management/upload-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to upload attachment." }, Number(error?.status) || 500);
  }
}
