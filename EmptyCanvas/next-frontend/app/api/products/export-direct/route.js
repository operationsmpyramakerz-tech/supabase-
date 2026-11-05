import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { validateProductExportParams } from "../../../../lib/export-access-policy.mjs";
import { renderProposalKitExport } from "../../../../lib/proposal-kit-export-service";
import { exportDocumentOrigin } from "../../../../lib/export-product-resource.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function text(value) {
  return String(value ?? "").trim();
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
  // Reject unsupported scopes before any DB read: do not let a forged
  // `scope` fall through to the Proposal exporter.
  let exportRequest;
  try {
    exportRequest = validateProductExportParams(url.searchParams);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  const { scope, kind, policy } = exportRequest;
  let gate = await getDirectAccountGate(policy.pages);
  for (const permission of policy.permissions) {
    if (!gate.ok) break;
    gate = featureGate(gate, permission);
  }
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.error || "Access denied." },
      { status: gate.status || 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const result = await renderProposalKitExport({
      account: gate.account || {},
      scope,
      id: url.searchParams.get("id") || "",
      proposalIds: url.searchParams.get("proposalIds") || url.searchParams.get("ids") || "",
      kind,
      columns: url.searchParams.get("columns") || null,
      groupBy: url.searchParams.get("groupBy") || url.searchParams.get("sortBy") || "component-tag",
      repeatedComponents: url.searchParams.get("repeatedComponents") || url.searchParams.get("repeatedComponentMode") || "separate",
      logic: url.searchParams.get("logic") || url.searchParams.get("combineLogic") || "add",
      totalQty: boolParam(url.searchParams.get("totalQty")),
      publicOrigin: exportDocumentOrigin(request, process.env.ERP_PUBLIC_APP_ORIGIN),
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
