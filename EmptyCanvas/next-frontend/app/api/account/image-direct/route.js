import { NextResponse } from "next/server";

import { finalizeAccountImage, removeAccountImage } from "../../../../lib/account-direct";
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

  try {
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

  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") || "";
    return json(await removeAccountImage(accountGate.account, kind));
  } catch (error) {
    console.error("DELETE /next/api/account/image-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to remove account image." }, Number(error?.status) || 500);
  }
}
