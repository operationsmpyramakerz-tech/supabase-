import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import OrderReceiptViewerClient from "../../../components/orders/OrderReceiptViewerClient";
import { loadOrderReceiptViewerItems } from "../../../lib/order-receipts-data";
import { getLegacyAccountGate } from "../../../lib/products-auth";

export const dynamic = "force-dynamic";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export default async function OrderReceiptViewerPage({ searchParams }) {
  const params = await Promise.resolve(searchParams || {});
  const ids = String(params?.ids || "").trim();

  if (!ids) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Order receipts need an order reference</h1>
          <p>Open this viewer from an expense or order that contains receipt files.</p>
          <div className="actions"><a className="primary-button" href="/next/expenses">Open Expenses</a><a className="secondary-button" href="/next/home">Return Home</a></div>
        </section>
      </main>
    );
  }

  const nextPath = `/next/orders/receipt-viewer?ids=${encodeURIComponent(ids)}`;
  const gate = await getLegacyAccountGate(["Expenses", "Expenses Users"]);
  if (gate.status === 401) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!gate.ok && gate.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Order receipts are not available</h1>
          <p>Your account needs Expenses or Expenses Users access to open these files.</p>
          <a className="primary-button" href="/next/home">Return Home</a>
        </section>
      </main>
    );
  }
  if (!gate.ok || !gate.account) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The receipt viewer could not load</h1>
          <p>{gate.error || "The authentication service is temporarily unavailable."}</p>
          <div className="actions"><a className="primary-button" href={nextPath}>Try again</a><a className="secondary-button" href="/next/home">Return Home</a></div>
        </section>
      </main>
    );
  }

  let payload = null;
  const warnings = [];
  try {
    payload = await loadOrderReceiptViewerItems(ids);
  } catch (error) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The receipt viewer could not load</h1>
          <p>{error?.message || "Receipt data is temporarily unavailable."}</p>
          <div className="actions"><a className="primary-button" href={nextPath}>Try again</a><a className="secondary-button" href="/next/home">Return Home</a></div>
        </section>
      </main>
    );
  }

  const account = gate.account;
  const allowed = new Set((Array.isArray(account.allowedPages) ? account.allowedPages : []).map(normalize));
  const canExpenses = allowed.has("expenses");
  const canExpensesUsers = allowed.has("expenses users");
  const activePath = canExpenses ? "/next/expenses" : canExpensesUsers ? "/next/expenses/users" : "/next/home";

  return (
    <AppShell
      account={account}
      title="Order Receipts"
      eyebrow="Expense-linked proof and delivery files"
      activePath={activePath}
    >
      <OrderReceiptViewerClient
        ids={ids}
        initialPayload={payload || { ok: true, items: [], ids: ids.split(",") }}
        canExpenses={canExpenses}
        canExpensesUsers={canExpensesUsers}
        bootstrapWarnings={warnings}
      />
    </AppShell>
  );
}
