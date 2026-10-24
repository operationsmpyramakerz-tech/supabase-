import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { uploadStorageObject } from "../../../../lib/supabase-rest";
import { parseStrictImageDataUrl } from "../../../../lib/strict-upload-image.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

function cleanFilename(value = "") {
  const raw = String(value || "receipt.jpg").trim() || "receipt.jpg";
  return { original: raw, safe: raw.replace(/[^a-z0-9._-]/gi, "_").slice(-120) || "receipt.jpg" };
}

export async function POST(request) {
  const gate = featureGate(await getDirectAccountGate(["Stocktaking"]), "stocktaking.upload_receipt");
  if (!gate.ok) {
    return noStore({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (!body?.dataUrl) return noStore({ ok: false, error: "Receipt image data is required." }, { status: 400 });
    // Reject SVG and non-image payloads even if the MIME header says image/*.
    const { mime, buffer } = parseStrictImageDataUrl(body.dataUrl, { label: "Receipt image", maxBytes: 8 * 1024 * 1024 });
    if (buffer.length > 8 * 1024 * 1024) return noStore({ ok: false, error: "Receipt image is too large. Maximum size is 8 MB." }, { status: 413 });

    const filename = cleanFilename(body?.filename);
    const objectPath = `stocktaking-receipts/${Date.now()}-${randomUUID()}-${filename.safe}`;
    const uploaded = await uploadStorageObject(objectPath, buffer, { contentType: mime, upsert: false });
    if (!uploaded?.publicUrl) throw new Error("Supabase Storage did not return a public receipt URL.");
    return noStore({ ok: true, source: "supabase-next", url: uploaded.publicUrl, name: filename.original, mime }, { status: 201 });
  } catch (error) {
    console.error("[stocktaking] direct receipt upload failed:", error?.details || error?.message || error);
    return noStore(
      { ok: false, error: error?.message || "Failed to upload receipt image." },
      { status: Number(error?.status) || 500 },
    );
  }
}
