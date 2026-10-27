import { NextResponse } from "next/server";

import { getDirectAccountGate } from "../../../../lib/products-auth";
import { completeUpload, storageErrorPayload, storagePolicy, verifyUploadReference } from "../../../../lib/storage-direct";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  let payload = null;
  try { payload = verifyUploadReference(body?.uploadRef || body?.reference); } catch (error) {
    const mapped = storageErrorPayload(error, "Invalid upload reference.");
    return json(mapped.body, mapped.status);
  }
  const policy = storagePolicy(payload?.scope);
  if (!policy) return json({ ok: false, code: "DIRECT_STORAGE_SCOPE_INVALID", error: "Unsupported upload area." }, 400);
  const gate = await getDirectAccountGate(policy.pages);
  if (!gate.ok || !gate.account) return json({ ok: false, error: gate.error || "Authentication required." }, gate.status || 503);
  try {
    return json(await completeUpload(gate.account, body?.uploadRef || body?.reference), 201);
  } catch (error) {
    console.error("POST /next/api/storage/upload-complete error:", error?.details || error?.message || error);
    const mapped = storageErrorPayload(error, "Failed to verify the uploaded file.");
    return json(mapped.body, mapped.status);
  }
}
