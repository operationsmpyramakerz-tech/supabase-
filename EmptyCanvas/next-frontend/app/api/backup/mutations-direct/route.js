import { NextResponse } from "next/server";

import { deleteAllBackupData, deleteBackupTableData, importBackupCsv, importBackupCsvUpload } from "../../../../lib/backup-direct";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const gate = await getDirectAccountGate(["Backup"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Backup access denied." }, gate.status || 503);
  const context = { account: gate.account || {}, memberId: gate.memberId || "" };

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    if (action === "import") {
      const uploadPath = String(body?.uploadPath || body?.path || "").trim();
      if (uploadPath) return json(await importBackupCsvUpload(context, body?.key, uploadPath, body?.adminPassword || body?.password));
      return json(await importBackupCsv(context, body?.key, body?.csvText || body?.csv || "", body?.adminPassword || body?.password));
    }
    if (action === "delete-table") return json(await deleteBackupTableData(context, body?.key, body?.adminPassword || body?.password));
    if (action === "delete-all") return json(await deleteAllBackupData(context, body?.adminPassword || body?.password));
    return json({ ok: false, error: "Unsupported Backup action." }, 400);
  } catch (error) {
    console.error("POST /next/api/backup/mutations-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Backup action failed." }, Number(error?.status) || 500);
  }
}
