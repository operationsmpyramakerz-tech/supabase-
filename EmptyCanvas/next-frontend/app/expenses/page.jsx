import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import ExpensesClient from "../../components/expenses/ExpensesClient";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { cashInFromOptions, expenseTypeOptions, expensesForAccount } from "../../lib/expenses-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Expenses is not available" : "The new Expenses page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/expenses?classic=1">Open classic Expenses</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

async function legacyPayload(path, fallback) {
  const response = await fetchLegacyJson(path, { timeoutMs: 20000 });
  return response.ok && response.data ? response.data : fallback;
}

export default async function ExpensesPage() {
  const gate = await getLegacyAccountGate(["Expenses"]);

  if (gate.status === 401) redirect("/login?next=/next/expenses");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to the Expenses module." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The current ERP authentication service is temporarily unavailable."} />;
  }

  const warnings = [];

  let expensePayload;
  try {
    expensePayload = await expensesForAccount(gate.account);
  } catch (directError) {
    expensePayload = await legacyPayload("/api/expenses", null);
    if (!expensePayload) {
      return <UnavailableState message={directError?.message || "Expense data is temporarily unavailable."} />;
    }
    warnings.push("Expenses recovery path used.");
  }

  const [typesResult, cashInResult, ordersPayload] = await Promise.all([
    expenseTypeOptions().then((options) => ({ success: true, options })).catch(async () => {
      warnings.push("Expense type options recovery path used.");
      return await legacyPayload("/api/expenses/types", { success: true, options: [] });
    }),
    cashInFromOptions().then((options) => ({ success: true, options })).catch(async () => {
      warnings.push("Cash-in options recovery path used.");
      return await legacyPayload("/api/expenses/cash-in-from/options", { success: true, options: [] });
    }),
    legacyPayload("/api/expenses/orders/options", { success: true, options: [] }),
  ]);

  if (!Array.isArray(ordersPayload?.options)) warnings.push("Order options are temporarily unavailable.");

  return (
    <AppShell
      account={gate.account}
      title="Expenses"
      eyebrow="Live cash-flow workspace"
      activePath="/next/expenses"
      bodyClass="expenses-page"
      classicStyles={["/css/expenses-redesign.css?v=expenses-dashboard-v2", "/next/css/expenses-classic-inline.css?v=stage2f"]}
    >
      <ExpensesClient
        account={gate.account}
        initialPayload={expensePayload || { success: true, items: [] }}
        initialTypes={Array.isArray(typesResult?.options) ? typesResult.options : []}
        cashInFromOptions={Array.isArray(cashInResult?.options) ? cashInResult.options : []}
        orderOptions={Array.isArray(ordersPayload?.options) ? ordersPayload.options : []}
        bootstrapWarnings={warnings}
      />
    </AppShell>
  );
}
