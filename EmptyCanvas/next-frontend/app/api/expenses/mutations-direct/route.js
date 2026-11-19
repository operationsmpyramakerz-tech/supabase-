import { NextResponse, after } from "next/server";
import { dispatchQueuedNotifications } from "../../../../lib/notification-event-worker";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { assertExpenseRecordAccess } from "../../../../lib/expenses-users-scope";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { directPageMutationAccess, verifyPageAdminPasswordDirect } from "../../../../lib/order-action-auth";
import {
  createExpenseCashIn,
  createExpenseCashOut,
  deleteExpenseForAdmin,
  settleExpenseAccount,
  updateExpenseForAdmin,
} from "../../../../lib/expenses-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function dispatchExpenseAlerts() {
  after(() => dispatchQueuedNotifications({ limit: 6 }).catch(error =>
    console.warn("[notifications] Expense delivery deferred:", error?.message)));
}

function text(value) {
  return String(value ?? "").trim();
}

function actionKey(value) {
  return text(value).toLowerCase().replace(/[_\s]+/g, "-");
}

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

function pageForAction(action) {
  return action === "admin-update" || action === "admin-delete" ? "Expenses Users" : "Expenses";
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = actionKey(body?.action);
  if (!["cash-in", "cash-out", "settle", "admin-update", "admin-delete"].includes(action)) {
    return noStore({ success: false, error: "Unsupported Expenses action." }, { status: 400 });
  }

  const pageName = pageForAction(action);
  const actionPermissions = {
    "cash-in": "expenses.cash_in", "cash-out": "expenses.cash_out", "settle": "expenses.settle",
    "admin-update": "expenses.users.edit", "admin-delete": "expenses.users.delete",
  };
  const gate = featureGate(await getDirectAccountGate([pageName]), actionPermissions[action], action === "admin-update" ? { legacyAllowed: false } : {});
  if (!gate.ok) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const mutationAccess = directPageMutationAccess(gate.account, [pageName]);
  if (action !== "admin-update" && mutationAccess === false) {
    return noStore({ success: false, error: "Edit access is required for this action." }, { status: 403 });
  }
  if (action !== "admin-update" && mutationAccess === null) {
    return noStore({ success: false, error: "The direct page permission context is unavailable." }, { status: 503 });
  }

  try {
    let result;
    if (action === "cash-in") {
      result = await createExpenseCashIn(gate.account || {}, body?.payload || body);
    } else if (action === "cash-out") {
      result = await createExpenseCashOut(gate.account || {}, body?.payload || body);
    } else if (action === "settle") {
      result = await settleExpenseAccount(gate.account || {}, body?.payload || body);
    } else {
      // Edit is authorized by the explicit feature grant and record scope.
      // Deletion still additionally requires the Admin password.
      await assertExpenseRecordAccess(gate.account, actionPermissions[action], body?.expenseId);
      if (action === "admin-update") {
        result = await updateExpenseForAdmin(body?.expenseId, body?.expense || body?.payload || {}, gate.account);
      } else {
        const adminPassword = text(body?.adminPassword);
        if (!adminPassword) return noStore({ success: false, error: "Admin password is required." }, { status: 400 });
        const passwordOk = await verifyPageAdminPasswordDirect(gate.account || {}, adminPassword, ["Expenses Users"]);
        if (passwordOk === null) return noStore({ success: false, error: "The direct Admin password context is unavailable." }, { status: 503 });
        if (!passwordOk) return noStore({ success: false, error: "Invalid Admin password." }, { status: 401 });
        result = await deleteExpenseForAdmin(body?.expenseId);
      }
    }
    if (["cash-in", "settle", "admin-update"].includes(action)) dispatchExpenseAlerts();
    return noStore(result || { success: true, source: "supabase-next" });
  } catch (error) {
    console.error(`[expenses] direct ${action} failed:`, error?.details || error?.message || error);
    return noStore(
      { success: false, error: error?.message || "Expense action failed." },
      { status: Number(error?.status) || 500 },
    );
  }
}
