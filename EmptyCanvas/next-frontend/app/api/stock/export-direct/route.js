import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { canAccessStocktakingColumn, stocktakingAccessLevel } from "../../../../lib/stocktaking-data";
import { renderStocktakingExport } from "../../../../lib/stocktaking-export-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function text(value) {
  return String(value ?? "").trim();
}

function contentDisposition(fileName = "stocktaking") {
  const safe = String(fileName || "stocktaking").replace(/[\r\n"]/g, "_");
  return `attachment; filename="${safe}"`;
}

async function handle(request) {
  const gate = await getDirectAccountGate(["Stocktaking"]);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const url = new URL(request.url);
  const column = text(url.searchParams.get("column"));
  if (!column) return NextResponse.json({ ok: false, error: "A Stocktaking folder is required for export." }, { status: 400 });
  const allowed = await canAccessStocktakingColumn(gate.account || {}, column, { fresh: false }).catch(() => false);
  if (!allowed && stocktakingAccessLevel(gate.account || {}) !== "admin") {
    return NextResponse.json({ ok: false, error: "This Stocktaking folder is not available for your access level." }, { status: 403 });
  }

  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  try {
    const result = await renderStocktakingExport({
      account: gate.account || {},
      kind: url.searchParams.get("kind") || "pdf",
      column,
      inventoryColumn: url.searchParams.get("inventoryColumn") || url.searchParams.get("inventory_column") || "",
      defectedColumn: url.searchParams.get("defectedColumn") || url.searchParams.get("defected_column") || "",
      columns: url.searchParams.get("columns") || null,
      instruction: body?.instruction || null,
      signatureLabels: body?.signatureLabels || null,
    });
    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": contentDisposition(result.fileName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[stocktaking] direct export failed:", error?.details || error?.message || error);
    return NextResponse.json(
      { ok: false, error: error?.message || "The stocktaking export failed." },
      { status: Number(error?.status) || 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function GET(request) {
  return await handle(request);
}

export async function POST(request) {
  return await handle(request);
}
