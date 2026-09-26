import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { findBackupTable } from "../../../../lib/backup-data";
import { verifyPageAdminPasswordDirect } from "../../../../lib/order-action-auth";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { createSignedUploadUrl } from "../../../../lib/supabase-rest";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

function text(value) { return String(value ?? "").trim(); }
function json(payload, status = 200) { return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } }); }
function safeName(value) { return (text(value) || "backup.csv").replace(/[^a-z0-9._-]/gi, "_"); }

export async function POST(request) {
  const gate = await getDirectAccountGate(["Backup"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Backup access denied." }, gate.status || 503);

  try {
    const body = await request.json().catch(() => ({}));
    const key = text(body?.key);
    if (!findBackupTable(key)) return json({ ok: false, error: "Backup table was not found." }, 404);
    const password = text(body?.adminPassword || body?.password);
    if (!password) return json({ ok: false, error: "Admin password is required." }, 400);
    const verified = await verifyPageAdminPasswordDirect(gate.account || {}, password, ["Backup"]);
    if (verified === null) return json({ ok: false, error: "The direct Admin password context is unavailable." }, 503);
    if (!verified) return json({ ok: false, error: "Invalid admin password." }, 401);

    const size = Math.max(0, Number(body?.size) || 0);
    const filename = text(body?.filename) || "backup.csv";
    if (!size) return json({ ok: false, error: "CSV file is empty." }, 400);
    if (size > MAX_BYTES) return json({ ok: false, error: "CSV file is too large. Maximum size is 25 MB." }, 413);
    if (!filename.toLowerCase().endsWith(".csv")) return json({ ok: false, error: "Only CSV files are allowed." }, 400);

    const objectPath = `backup-imports/${Date.now()}-${crypto.randomUUID().slice(0, 12)}-${safeName(filename)}`;
    const ticket = await createSignedUploadUrl(objectPath);
    return json({
      ok: true,
      uploadPath: ticket.path,
      upload: {
        method: "PUT",
        signedUrl: ticket.signedUrl,
        headers: { "x-upsert": "false", "Content-Type": text(body?.mime) || "text/csv" },
      },
      source: "supabase-next",
    });
  } catch (error) {
    console.error("POST /next/api/backup/import-ticket error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to prepare CSV import." }, Number(error?.status) || 500);
  }
}
