import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { getSupabaseConfig, uploadStorageObject } from "../../../../../lib/supabase-rest";

export const dynamic = "force-dynamic";

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function parseImageDataUrl(value = "") {
  const match = String(value || "").match(/^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) {
    const error = new Error("Receipt image data is invalid.");
    error.status = 400;
    throw error;
  }
  const mime = String(match[1] || "").trim().toLowerCase();
  if (!mime.startsWith("image/")) {
    const error = new Error("Receipt upload must be an image.");
    error.status = 400;
    throw error;
  }
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length) {
    const error = new Error("Receipt image data is invalid.");
    error.status = 400;
    throw error;
  }
  if (buffer.length > 8 * 1024 * 1024) {
    const error = new Error("Receipt image is too large. Maximum size is 8 MB.");
    error.status = 413;
    throw error;
  }
  return { mime, buffer };
}

function cleanFilename(value = "receipt.jpg") {
  const raw = String(value || "receipt.jpg").trim() || "receipt.jpg";
  const cleaned = raw.replace(/[^a-z0-9._-]/gi, "_").replace(/^_+|_+$/g, "");
  return cleaned || "receipt.jpg";
}

export async function POST(request) {
  const gate = await getDirectAccountGate(["Proposals", "Kits", "Products"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Access denied." }, gate.status || 503);

  try {
    const body = await request.json().catch(() => ({}));
    if (!body?.dataUrl) return json({ ok: false, error: "Receipt image data is required." }, 400);

    const { storageBucket } = getSupabaseConfig();
    if (!String(storageBucket || "").trim()) {
      return json({ ok: false, error: "Supabase Storage is not configured for receipt uploads." }, 500);
    }

    const { mime, buffer } = parseImageDataUrl(body.dataUrl);
    const originalName = String(body?.filename || "receipt.jpg").trim() || "receipt.jpg";
    const objectName = `proposal-receipts/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${cleanFilename(originalName)}`;
    const uploaded = await uploadStorageObject(objectName, buffer, {
      contentType: mime,
      bucketName: storageBucket,
      upsert: true,
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
