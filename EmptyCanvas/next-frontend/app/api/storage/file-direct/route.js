import { NextResponse } from "next/server";

import { getDirectAccountGate } from "../../../../lib/products-auth";
import {
  canUseStorage,
  markFileRedirect,
  payloadMatchesPolicy,
  signedDownloadUrl,
  storagePolicy,
  verifyFileReference,
} from "../../../../lib/storage-direct";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function textResponse(message, status = 500) {
  return new NextResponse(message, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" } });
}

export async function GET(request) {
  const url = new URL(request.url);
  let payload = null;
  try { payload = verifyFileReference(url.searchParams.get("reference") || ""); }
  catch (error) { return textResponse(error?.message || "File link is no longer available.", Number(error?.status) || 400); }

  const policy = storagePolicy(payload.scope);
  if (!policy || !payloadMatchesPolicy(payload, policy)) return textResponse("File link is no longer available.", 404);
  const gate = await getDirectAccountGate(policy.pages);
  if (!gate.ok || !gate.account) return textResponse(gate.error || "Authentication required.", gate.status || 503);
  const access = canUseStorage(gate.account, policy);
  if (!access.ok) return textResponse(access.error, access.status);

  try {
    const redirectUrl = await signedDownloadUrl(payload, {
      download: ["1", "true", "yes"].includes(String(url.searchParams.get("download") || "").toLowerCase()),
    });
    markFileRedirect();
    return NextResponse.redirect(redirectUrl, { status: 302, headers: { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    console.error("GET /next/api/storage/file-direct error:", error?.details || error?.message || error);
    return textResponse(error?.message || "Failed to open the stored file.", Number(error?.status) || 500);
  }
}
