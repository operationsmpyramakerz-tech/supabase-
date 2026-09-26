import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { renderProposalKitExport } from "../../../../lib/proposal-kit-export-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function text(value) {
  return String(value ?? "").trim();
}

function requiredPages(scope = "proposal") {
  const clean = text(scope).toLowerCase();
  if (clean === "kit") return ["Kits", "Proposals", "Products"];
  return ["Proposals", "Products"];
}

function boolParam(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function safeDisposition(fileName = "products-export") {
  const clean = text(fileName || "products-export").replace(/[\r\n"]/g, "_") || "products-export";
  return `attachment; filename="${clean}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const scope = text(url.searchParams.get("scope") || "proposal").toLowerCase();
  const gate = await getDirectAccountGate(requiredPages(scope));
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.error || "Authentication required." },
      { status: gate.status || 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const result = await renderProposalKitExport({
      account: gate.account || {},
      scope,
      id: url.searchParams.get("id") || "",
      proposalIds: url.searchParams.get("proposalIds") || url.searchParams.get("ids") || "",
      kind: url.searchParams.get("kind") || "pdf",
      columns: url.searchParams.get("columns") || null,
      groupBy: url.searchParams.get("groupBy") || url.searchParams.get("sortBy") || "component-tag",
      repeatedComponents: url.searchParams.get("repeatedComponents") || url.searchParams.get("repeatedComponentMode") || "separate",
      logic: url.searchParams.get("logic") || url.searchParams.get("combineLogic") || "add",
      totalQty: boolParam(url.searchParams.get("totalQty")),
    });
    const buffer = Buffer.isBuffer(result?.buffer) ? result.buffer : Buffer.from(result?.buffer || []);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": result?.contentType || "application/octet-stream",
        "Content-Disposition": safeDisposition(result?.fileName),
        "Cache-Control": "private, no-store",
        "Content-Length": String(buffer.length),
        "X-ERP-Export-Mode": "next-direct",
      },
    });
  } catch (error) {
    console.error("[products] direct export failed:", error?.details || error?.message || error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Products export failed." },
      { status: Number(error?.status) || 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
