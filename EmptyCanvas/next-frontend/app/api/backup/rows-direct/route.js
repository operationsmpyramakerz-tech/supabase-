import { NextResponse } from "next/server";

import { createBackupRow, updateBackupRow } from "../../../../lib/backup-direct";
import { loadBackupTableRows } from "../../../../lib/backup-data";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { featureAllowed } from "../../../../lib/feature-permissions-registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function context(permission) {
  const gate = await getDirectAccountGate(["Backup"]);
  if (!gate.ok) return { ok: false, gate };
  const permitted = featureGate(gate, permission);
  if (!permitted.ok) return { ok: false, gate: permitted };
  return { ok: true, gate: permitted, account: gate.account || {}, memberId: gate.memberId || "" };
}

export async function GET(request) {
  const ctx = await context("backup.row_read");
  if (!ctx.ok) return json({ ok: false, error: ctx.gate.error || "Backup access denied." }, ctx.gate.status || 503);
  try {
    const url = new URL(request.url);
    const key = String(url.searchParams.get("key") || "").trim();
    const limit = url.searchParams.get("limit") || "50";
    const offset = url.searchParams.get("offset") || "0";
    const payload = await loadBackupTableRows(key, { limit, offset, account: ctx.account });
    return json({ ...payload, canEdit: Boolean(payload.canEdit) && featureAllowed(ctx.account, "backup.row_edit"), canCreate: Boolean(payload.canEdit) && featureAllowed(ctx.account, "backup.row_create") });
  } catch (error) {
    console.error("GET /next/api/backup/rows-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to load table rows." }, Number(error?.status) || 500);
  }
}

export async function POST(request) {
  const ctx = await context("backup.row_create");
  if (!ctx.ok) return json({ ok: false, error: ctx.gate.error || "Backup access denied." }, ctx.gate.status || 503);
  try {
    const body = await request.json().catch(() => ({}));
    const result = await createBackupRow(ctx, body?.key, body?.values);
    return json(result, 201);
  } catch (error) {
    console.error("POST /next/api/backup/rows-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to create table row." }, Number(error?.status) || 500);
  }
}

export async function PATCH(request) {
  const ctx = await context("backup.row_edit");
  if (!ctx.ok) return json({ ok: false, error: ctx.gate.error || "Backup access denied." }, ctx.gate.status || 503);
  try {
    const body = await request.json().catch(() => ({}));
    return json(await updateBackupRow(ctx, body?.key, body?.originalRow, body?.changes));
  } catch (error) {
    console.error("PATCH /next/api/backup/rows-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to update table row." }, Number(error?.status) || 500);
  }
}
