import { NextResponse } from "next/server";

import { finalizeAccountImage, removeAccountImage, uploadAccountImageDirect } from "../../../../lib/account-direct";
import { featureAllowed } from "../../../../lib/feature-permissions-registry";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function gate() {
  return await getDirectAccountGate([]);
}

export async function POST(request) {
  const accountGate = await gate();
  if (!accountGate.ok || !accountGate.account) {
    return json({ ok: false, error: accountGate.error || "Authentication required." }, accountGate.status || 503);
  }

  if (!featureAllowed(accountGate.account, "account.view") || !featureAllowed(accountGate.account, "account.avatar")) {
    return json({ ok: false, error: "Permission account.avatar is not allowed." }, 403);
  }

  try {
    // Multipart is the preferred upload path: a single save operation. Keep
    // the signed-ticket JSON finalizer for older client versions.
    if (String(request.headers.get("content-type") || "").toLowerCase().includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("image");
      if (!file || typeof file.arrayBuffer !== "function") {
        return json({ ok: false, error: "A profile picture is required." }, 400);
      }
      if (!file.size || file.size > 10 * 1024 * 1024) {
        return json({ ok: false, error: "Image must be between 1 byte and 10MB." }, 413);
      }
      const body = {
        kind: form.get("kind"),
        currentPassword: form.get("currentPassword"),
        filename: file.name,
        mime: file.type,
        bytes: Buffer.from(await file.arrayBuffer()),
      };
      return json(await uploadAccountImageDirect(accountGate.account, body));
    }
    const body = await request.json().catch(() => ({}));
    return json(await finalizeAccountImage(accountGate.account, body));
  } catch (error) {
    console.error("POST /next/api/account/image-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to update account image." }, Number(error?.status) || 500);
  }
}

export async function DELETE(request) {
  const accountGate = await gate();
  if (!accountGate.ok || !accountGate.account) {
    return json({ ok: false, error: accountGate.error || "Authentication required." }, accountGate.status || 503);
  }

  if (!featureAllowed(accountGate.account, "account.view") || !featureAllowed(accountGate.account, "account.avatar")) {
    return json({ ok: false, error: "Permission account.avatar is not allowed." }, 403);
  }

  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") || "";
    return json(await removeAccountImage(accountGate.account, kind));
  } catch (error) {
    console.error("DELETE /next/api/account/image-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to remove account image." }, Number(error?.status) || 500);
  }
}
