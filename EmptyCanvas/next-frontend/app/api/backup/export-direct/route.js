import { exportAllBackupTables, exportBackupTable } from "../../../../lib/backup-direct";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function errorResponse(message, status = 500) {
  return new Response(String(message || "Export failed."), {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

export async function GET(request) {
  const gate = await getDirectAccountGate(["Backup"]);
  if (!gate.ok) return errorResponse(gate.error || "Backup access denied.", gate.status || 503);
  try {
    const url = new URL(request.url);
    const scope = String(url.searchParams.get("scope") || "").trim().toLowerCase();
    const key = String(url.searchParams.get("key") || "").trim();
    const exported = scope === "all" ? await exportAllBackupTables() : await exportBackupTable(key);
    return new Response(exported.data, {
      status: 200,
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${String(exported.filename || "database-export").replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /next/api/backup/export-direct error:", error?.details || error);
    return errorResponse(error?.message || "Failed to export database data.", Number(error?.status) || 500);
  }
}
