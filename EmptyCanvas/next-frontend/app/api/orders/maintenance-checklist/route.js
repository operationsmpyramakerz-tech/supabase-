import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { directPageMutationAccess } from "../../../../lib/order-action-auth";
import {
  createMaintenanceChecklistItem,
  deleteMaintenanceChecklistItem,
  listMaintenanceChecklistItems,
  updateMaintenanceChecklistItem,
} from "../../../../lib/maintenance-checklist-data";

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

function directErrorResponse(error) {
  if (error?.code !== "DIRECT_MAINTENANCE_CHECKLIST_FAILED") return null;
  return noStore(
    { error: error?.message || "Maintenance checklist action failed." },
    { status: Number(error?.status) || 500 },
  );
}

async function accountGate() {
  return await getLegacyAccountGate(["Maintenance Orders", "Operations Orders"]);
}

async function legacyFallback(method, body = {}) {
  const id = String(body?.id || "").trim();
  const path = ["PATCH", "DELETE"].includes(method) && id
    ? `/api/orders/maintenance-checklist/${encodeURIComponent(id)}`
    : "/api/orders/maintenance-checklist";
  const legacy = await fetchLegacyJson(path, {
    method,
    ...(method === "GET" || method === "DELETE" ? {} : { body: { text: body?.text ?? body?.value } }),
    timeoutMs: 20_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Maintenance checklist action failed." },
    { status: legacy.status || 502 },
  );
}

function writeAccess(account = {}) {
  return directPageMutationAccess(account, ["Maintenance Orders", "Operations Orders"]);
}

export async function GET() {
  const gate = await accountGate();
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  try {
    const items = await listMaintenanceChecklistItems();
    if (items !== null) return noStore({ items });
  } catch (error) {
    console.warn("[maintenance-checklist] direct GET failed; using Legacy fallback:", error?.message || error);
  }
  return await legacyFallback("GET");
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const gate = await accountGate();
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const access = writeAccess(gate.account);
  if (access === false) return noStore({ error: "Edit access is required for this action." }, { status: 403 });
  if (access === null) return await legacyFallback("POST", body);

  try {
    const result = await createMaintenanceChecklistItem({ account: gate.account, value: body?.text ?? body?.value });
    if (result) return noStore(result, { status: result?.existing ? 200 : 201 });
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.warn("[maintenance-checklist] direct POST failed; using Legacy fallback:", error?.message || error);
  }
  return await legacyFallback("POST", body);
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const gate = await accountGate();
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const access = writeAccess(gate.account);
  if (access === false) return noStore({ error: "Edit access is required for this action." }, { status: 403 });
  if (access === null) return await legacyFallback("PATCH", body);

  try {
    const result = await updateMaintenanceChecklistItem({ id: body?.id, value: body?.text ?? body?.value });
    if (result) return noStore(result);
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.warn("[maintenance-checklist] direct PATCH failed; using Legacy fallback:", error?.message || error);
  }
  return await legacyFallback("PATCH", body);
}

export async function DELETE(request) {
  const body = await request.json().catch(() => ({}));
  const gate = await accountGate();
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const access = writeAccess(gate.account);
  if (access === false) return noStore({ error: "Edit access is required for this action." }, { status: 403 });
  if (access === null) return await legacyFallback("DELETE", body);

  try {
    const result = await deleteMaintenanceChecklistItem({ id: body?.id });
    if (result) return noStore(result);
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.warn("[maintenance-checklist] direct DELETE failed; using Legacy fallback:", error?.message || error);
  }
  return await legacyFallback("DELETE", body);
}
