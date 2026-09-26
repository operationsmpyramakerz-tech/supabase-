import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
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
  return await getDirectAccountGate(["Maintenance Orders", "Operations Orders"]);
}

function writeAccess(account = {}) {
  return directPageMutationAccess(account, ["Maintenance Orders", "Operations Orders"]);
}

function directUnavailable(message = "The direct maintenance checklist service is unavailable.") {
  return noStore({ error: message }, { status: 503 });
}

export async function GET() {
  const gate = await accountGate();
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  try {
    const items = await listMaintenanceChecklistItems();
    if (items !== null) return noStore({ items });
    return directUnavailable();
  } catch (error) {
    console.error("[maintenance-checklist] direct GET failed:", error?.message || error);
    return noStore({ error: error?.message || "Failed to load maintenance checklist." }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const gate = await accountGate();
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const access = writeAccess(gate.account);
  if (access === false) return noStore({ error: "Edit access is required for this action." }, { status: 403 });
  if (access === null) return directUnavailable("The direct page permission context is unavailable.");

  try {
    const result = await createMaintenanceChecklistItem({ account: gate.account, value: body?.text ?? body?.value });
    if (result) return noStore(result, { status: result?.existing ? 200 : 201 });
    return directUnavailable();
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.error("[maintenance-checklist] direct POST failed:", error?.message || error);
    return noStore({ error: error?.message || "Maintenance checklist action failed." }, { status: Number(error?.status) || 500 });
  }
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const gate = await accountGate();
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const access = writeAccess(gate.account);
  if (access === false) return noStore({ error: "Edit access is required for this action." }, { status: 403 });
  if (access === null) return directUnavailable("The direct page permission context is unavailable.");

  try {
    const result = await updateMaintenanceChecklistItem({ id: body?.id, value: body?.text ?? body?.value });
    if (result) return noStore(result);
    return directUnavailable();
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.error("[maintenance-checklist] direct PATCH failed:", error?.message || error);
    return noStore({ error: error?.message || "Maintenance checklist action failed." }, { status: Number(error?.status) || 500 });
  }
}

export async function DELETE(request) {
  const body = await request.json().catch(() => ({}));
  const gate = await accountGate();
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const access = writeAccess(gate.account);
  if (access === false) return noStore({ error: "Edit access is required for this action." }, { status: 403 });
  if (access === null) return directUnavailable("The direct page permission context is unavailable.");

  try {
    const result = await deleteMaintenanceChecklistItem({ id: body?.id });
    if (result) return noStore(result);
    return directUnavailable();
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.error("[maintenance-checklist] direct DELETE failed:", error?.message || error);
    return noStore({ error: error?.message || "Maintenance checklist action failed." }, { status: Number(error?.status) || 500 });
  }
}
