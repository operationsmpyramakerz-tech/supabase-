import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { directTaskManagementContext, taskManagementCurrentMember } from "../../../../lib/task-management-data";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { assertPrivateStorageBucket, uploadStorageObject } from "../../../../lib/supabase-rest";
import { createFileReference, fileUrl, safeFileName } from "../../../../lib/storage-direct";
import { DIRECT_TASK_ATTACHMENT_BUCKET, directTaskOwnerPrefix, readDirectTaskAttachment } from "../../../../lib/direct-task-attachment-policy.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 60;

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const context = await directTaskManagementContext("delegated");
  if (!context?.ok) return json({ ok: false, error: context?.error || "Task Management access denied." }, context?.status || 503);
  for (const permission of ["tasks.project_create", "tasks.attachment_upload"]) {
    const gate = featureGate(context, permission);
    if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status || 403);
  }
  try {
    const ownerPrefix = directTaskOwnerPrefix(taskManagementCurrentMember(context).id);
    const name = safeFileName(new URL(request.url).searchParams.get("filename"));
    const hint = String(request.headers.get("content-type") || "").trim().toLowerCase();
    const type = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(hint) ? hint : "application/octet-stream";
    const bytes = await readDirectTaskAttachment(request);
    // New direct-task files are always private; never fall back to a public bucket.
    await assertPrivateStorageBucket(DIRECT_TASK_ATTACHMENT_BUCKET);
    const path = `${ownerPrefix}${randomUUID()}-${name.clean}`;
    const uploaded = await uploadStorageObject(path, bytes, { contentType: type, upsert: false, bucketName: DIRECT_TASK_ATTACHMENT_BUCKET });
    if (uploaded?.path !== path) throw new Error("Storage did not confirm the attachment upload.");
    const reference = createFileReference({
      bucket: DIRECT_TASK_ATTACHMENT_BUCKET, path, name: name.original,
      type, size: bytes.length, scope: "task-management", recordAuthRequired: true,
    });
    return json({ ok: true, file: { name: name.original, url: fileUrl(reference, name.original), type, size: bytes.length } }, 201);
  } catch (error) {
    console.error("Individual task attachment upload failed:", error?.message);
    return json({ ok: false, error: error?.message || "Failed to upload attachment." }, Number(error?.status) || 500);
  }
}
