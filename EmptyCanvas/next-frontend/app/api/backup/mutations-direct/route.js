import { NextResponse } from "next/server";

import { deleteAllBackupData, deleteBackupTableData, importBackupCsv, importBackupCsvUpload } from "../../../../lib/backup-direct";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { recordHistoryForAccount } from "../../../../lib/history-audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function auditBackupMutation(gate, result, action, key) {
  if (result?.ok === false || result?.success === false) return result;
  try {
    await recordHistoryForAccount({
      account: gate.account,
      memberId: gate.memberId,
      pageName: "Backup",
      pageKey: "backup",
      actionLabel: ({ import: "Imported backup CSV", "delete-table": "Deleted backup table data", "delete-all": "Deleted all backup data" })[action] || "Changed backup data",
      actionKey: `backup.${action}`,
      entityType: "backup_table",
      entityLabel: action === "delete-all" ? "All tables" : key,
      method: "POST",
      path: "/next/api/backup/mutations-direct",
      statusCode: 200,
    });
  } catch (error) {
    console.error("BACKUP_AUDIT_WRITE_FAILED", error);
  }
  return result;
}

export async function POST(request) {
  const gate = await getDirectAccountGate(["Backup"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Backup access denied." }, gate.status || 503);
  const context = { account: gate.account || {}, memberId: gate.memberId || "" };

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const permissions = { import: "backup.import", "delete-table": "backup.delete_table", "delete-all": "backup.delete_all" };
    const permissionKey = permissions[action];
    if (!permissionKey) return json({ ok: false, error: "Unsupported Backup action." }, 400);
    const permitted = featureGate(gate, permissionKey);
    if (!permitted.ok) return json({ ok: false, error: permitted.error }, permitted.status);
    if (action === "import") {
      const uploadPath = String(body?.uploadPath || body?.path || "").trim();
      const result = uploadPath
        ? await importBackupCsvUpload(context, body?.key, uploadPath, body?.adminPassword || body?.password)
        : await importBackupCsv(context, body?.key, body?.csvText || body?.csv || "", body?.adminPassword || body?.password);
      return json(await auditBackupMutation(gate, result, action, String(body?.key || "")));
    }
    if (action === "delete-table") {
      const result = await deleteBackupTableData(context, body?.key, body?.adminPassword || body?.password);
      return json(await auditBackupMutation(gate, result, action, String(body?.key || "")));
    }
    if (action === "delete-all") {
      const result = await deleteAllBackupData(context, body?.adminPassword || body?.password);
      return json(await auditBackupMutation(gate, result, action, ""));
    }
    return json({ ok: false, error: "Unsupported Backup action." }, 400);
  } catch (error) {
    console.error("POST /next/api/backup/mutations-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Backup action failed." }, Number(error?.status) || 500);
  }
}
