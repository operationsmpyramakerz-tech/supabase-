import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { directTaskManagementContext } from "../../../../lib/task-management-data";
import { uploadStorageObject } from "../../../../lib/supabase-rest";

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

  try {
    const dataUrl = text(body?.dataUrl || body?.data);
    const filename = text(body?.filename || body?.name, 500) || "attachment";
    const mimeHint = text(body?.mime || body?.type, 180);
    const match = dataUrl.match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
    if (!match) return json({ ok: false, error: "Choose a valid attachment first." }, 400);
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length) return json({ ok: false, error: "The selected attachment is empty." }, 400);
    if (bytes.length > 10 * 1024 * 1024) return json({ ok: false, error: "The attachment must be 10 MB or less." }, 413);
    const cleanName = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment";
    const objectPath = `task-management/attachments/${Date.now()}-${crypto.randomUUID()}-${cleanName}`;
    const uploaded = await uploadStorageObject(objectPath, bytes, { contentType: mimeHint || match[1] || "application/octet-stream", upsert: false });
    if (!uploaded?.publicUrl) throw new Error("Supabase Storage did not return an attachment URL.");
    return json({
      ok: true,
      file: { name: filename, url: uploaded.publicUrl, type: mimeHint || match[1] || "application/octet-stream", size: bytes.length },
      source: "supabase-next",
    }, 201);
  } catch (error) {
    console.error("POST /next/api/task-management/upload-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to upload attachment." }, Number(error?.status) || 500);
  }
}
