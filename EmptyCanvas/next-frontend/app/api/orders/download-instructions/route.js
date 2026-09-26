import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import {
  createOrderDownloadInstruction,
  listOrderDownloadInstructions,
  updateOrderDownloadInstruction,
} from "../../../../lib/order-download-instructions-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

async function gate() {
  return await getLegacyAccountGate([]);
}

function failure(error, fallback) {
  return noStore(
    { error: error?.message || fallback },
    { status: Number(error?.status) || 500 },
  );
}

export async function GET() {
  const access = await gate();
  if (!access.ok) return noStore({ error: access.error || "Authentication required." }, { status: access.status || 503 });

  try {
    const items = await listOrderDownloadInstructions();
    if (!Array.isArray(items)) return noStore({ error: "Saved instructions storage is unavailable." }, { status: 503 });
    return noStore({ items });
  } catch (error) {
    return failure(error, "Failed to load saved instructions.");
  }
}

export async function POST(request) {
  const access = await gate();
  if (!access.ok) return noStore({ error: access.error || "Authentication required." }, { status: access.status || 503 });

  try {
    const body = await request.json().catch(() => ({}));
    const result = await createOrderDownloadInstruction({ account: access.account || {}, body });
    if (!result) return noStore({ error: "Saved instructions storage is unavailable." }, { status: 503 });
    return noStore(result, { status: 201 });
  } catch (error) {
    return failure(error, "Failed to save instructions.");
  }
}

export async function PATCH(request) {
  const access = await gate();
  if (!access.ok) return noStore({ error: access.error || "Authentication required." }, { status: access.status || 503 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const result = await updateOrderDownloadInstruction({ id, body });
    if (!result) return noStore({ error: "Saved instructions storage is unavailable." }, { status: 503 });
    return noStore(result);
  } catch (error) {
    return failure(error, "Failed to update instructions.");
  }
}
