import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { featureGate } from "../../../../../lib/feature-permissions-server";
import { featureAllowed } from "../../../../../lib/feature-permissions-registry";
import { getSupabaseConfig, uploadStorageObject } from "../../../../../lib/supabase-rest";
import { parseStrictImageDataUrl } from "../../../../../lib/strict-upload-image.mjs";

export const dynamic = "force-dynamic";

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function cleanFilename(value = "receipt.jpg") {
  const raw = String(value || "receipt.jpg").trim() || "receipt.jpg";
  const cleaned = raw.replace(/[^a-z0-9._-]/gi, "_").replace(/^_+|_+$/g, "");
  return cleaned || "receipt.jpg";
}

export async function POST(request) {
  const originalGate = await getDirectAccountGate(["Proposals", "Kits", "Products"]);
  // Receipts are also uploaded by Send Kit to Stock. Allow that operation
  // independently of a user's Proposals feature profile.
  const gate = originalGate.ok && featureAllowed(originalGate.account, "kits.send_stock")
    ? originalGate : featureGate(originalGate, "proposals.receipt_upload");
  if (!gate.ok) return json({ ok: false, error: gate.error || "Access denied." }, gate.status || 503);

  try {
    const body = await request.json().catch(() => ({}));
    if (!body?.dataUrl) return json({ ok: false, error: "Receipt image data is required." }, 400);

    const { storageBucket } = getSupabaseConfig();
    if (!String(storageBucket || "").trim()) {
      return json({ ok: false, error: "Supabase Storage is not configured for receipt uploads." }, 500);
    }

    const { mime, buffer } = parseStrictImageDataUrl(body.dataUrl, { label: "Receipt image", maxBytes: 8 * 1024 * 1024 });
    const originalName = String(body?.filename || "receipt.jpg").trim() || "receipt.jpg";
    const cleanName = cleanFilename(originalName).replace(/\.[^.]+$/, "") || "receipt";
    const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const objectName = `proposal-receipts/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${cleanName}.${extension}`;
    const uploaded = await uploadStorageObject(objectName, buffer, {
      contentType: mime,
      bucketName: storageBucket,
      upsert: false,
    });
    if (!uploaded?.publicUrl) {
      const error = new Error("Supabase Storage did not return a public receipt URL.");
      error.status = 502;
      throw error;
    }

    return json({
      ok: true,
      source: "supabase-next",
      url: uploaded.publicUrl,
      name: originalName,
      mime,
    }, 201);
  } catch (error) {
    console.error("POST /next/api/products/proposals/receipt-upload error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to upload receipt image." }, Number(error?.status) || 500);
  }
}
