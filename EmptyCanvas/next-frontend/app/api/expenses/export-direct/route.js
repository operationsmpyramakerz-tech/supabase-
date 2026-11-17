import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { renderExpenseExport } from "../../../../lib/expense-export-service";
import { resolveExpenseUserAccess, scopeExpenseDetail } from "../../../../lib/expenses-users-scope";
import { expensesForAccount, expensesForMemberId } from "../../../../lib/expenses-data";
import { selectAuthorizedExpenseExportRows, authorizedExpenseExportIdentity } from "../../../../lib/expense-export-input-policy.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function text(value) {
  return String(value ?? "").trim();
}

function safeDownloadName(value, fallback = "expenses") {
  const name = text(value || fallback).replace(/[\r\n"]/g, "");
  return name || fallback;
}

function requiredPages(scope = "") {
  const key = text(scope).toLowerCase();
  if (key === "current" || key === "expenses") return ["Expenses"];
  if (key === "users" || key === "expenses-users") return ["Expenses Users"];
  return null;
}

function requestOrigin(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return "";
  }
}

function jsonError(message, status = 500) {
  return NextResponse.json(
    { success: false, error: message || "Expense export failed." },
    { status: Number(status) || 500, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const url = new URL(request.url);
  const kind = text(body?.kind || url.searchParams.get("kind")).toLowerCase();
  const scope = text(body?.scope || url.searchParams.get("scope")).toLowerCase();
  if (!["pdf", "excel", "xlsx"].includes(kind)) return jsonError("Unsupported expense export type.", 400);

  const pages = requiredPages(scope);
  if (!pages) return jsonError("Unsupported expense export scope.", 400);
  const gate = featureGate(await getDirectAccountGate(pages),
    pages[0] === "Expenses Users" ? "expenses.users.export" : "expenses.export");
  if (!gate.ok) return jsonError(gate.error || "Authentication required.", gate.status || 503);

  try {
    const isUsersExport = pages[0] === "Expenses Users";
    const memberId = text(body?.userId);
    if (isUsersExport && !memberId) return jsonError("A user ID is required to export team expenses.", 400);
    // Resolve the canonical team identity on the server. Do not trust the
    // report title, employee ID, or row values supplied by the browser.
    const lookupId = isUsersExport
      ? await resolveExpenseUserAccess(gate.account, "expenses.users.export", memberId)
      : "";
    const authorized = isUsersExport
      ? await scopeExpenseDetail(gate.account, "expenses.users.export", memberId, await expensesForMemberId(lookupId))
      : await expensesForAccount(gate.account || {});
    const selection = selectAuthorizedExpenseExportRows(body?.items, authorized?.items);
    if (!selection.ok) return jsonError(selection.error, selection.status);
    const selected = selection.rows;
    const identity = authorizedExpenseExportIdentity(selected, {
      account: gate.account, lookupId, usersExport: isUsersExport,
    });
    const result = await renderExpenseExport({
      kind,
      ...identity,
      items: selected,
      dateFrom: body?.dateFrom,
      dateTo: body?.dateTo,
      baseUrl: requestOrigin(request),
      includeDestination: isUsersExport,
    });
    const fallback = kind === "pdf" ? "expenses.pdf" : "expenses.xlsx";
    const fileName = safeDownloadName(result?.fileName, fallback);
    const buffer = Buffer.isBuffer(result?.buffer) ? result.buffer : Buffer.from(result?.buffer || []);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": result?.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-ERP-Export-Mode": "next-direct",
      },
    });
  } catch (error) {
    console.error("[expenses] direct export failed:", error?.details || error?.message || error);
    return jsonError(error?.message || "Expense export failed.", Number(error?.status) || 500);
  }
}
