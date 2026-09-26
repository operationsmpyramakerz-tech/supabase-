import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { directB2cContext } from "../../../../lib/b2c-data";
import { createSignedUploadUrl } from "../../../../lib/supabase-rest";

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

  try {
    const body = await request.json().catch(() => ({}));
    const filename = text(body?.filename || body?.name, 240) || "attachment";
    const mime = text(body?.mime || body?.type, 160) || "application/octet-stream";
    const size = Math.max(0, Number(body?.size) || 0);
    if (!size) return json({ ok: false, error: "Choose a valid photo or file first." }, 400);
    if (size > MAX_BYTES) return json({ ok: false, error: "Each file must be 10 MB or less." }, 413);

    const objectPath = `b2c/customer-files/${Date.now()}-${crypto.randomUUID()}-${safeName(filename)}`;
    const ticket = await createSignedUploadUrl(objectPath);
    return json({
      ok: true,
      file: { name: filename, url: ticket.publicUrl, type: mime, size },
      upload: {
        method: "PUT",
        signedUrl: ticket.signedUrl,
        publicUrl: ticket.publicUrl,
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
