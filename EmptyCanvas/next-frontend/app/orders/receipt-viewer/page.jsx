import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import OrderReceiptViewerClient from "../../../components/orders/OrderReceiptViewerClient";
import { fetchLegacyJson } from "../../../lib/legacy-api";

export const dynamic = "force-dynamic";

function resourceMap(bundle) {
  const map = new Map();
  for (const resource of Array.isArray(bundle?.resources) ? bundle.resources : []) {
    map.set(String(resource?.url || ""), resource?.body);
  }
  return map;
}

function getResource(map, prefix, fallback = null) {
  for (const [url, body] of map.entries()) {
    if (url === prefix || url.startsWith(`${prefix}?`)) return body;
  }
  return fallback;
}

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

  const response = await fetchLegacyJson(`/api/page-bootstrap?scope=order-receipts&ids=${encodeURIComponent(ids)}`, { timeoutMs: 35000 });
  const nextPath = `/next/orders/receipt-viewer?ids=${encodeURIComponent(ids)}`;

  if (response.status === 401) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (response.status === 403) {
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

  if (!response.ok || !response.data?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The receipt viewer could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions"><a className="primary-button" href={`/orders/order-receipt-viewer?ids=${encodeURIComponent(ids)}`}>Open classic viewer</a><a className="secondary-button" href="/next/home">Return Home</a></div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account");
  if (!account) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  const allowed = new Set((Array.isArray(account.allowedPages) ? account.allowedPages : []).map(normalize));
  const canExpenses = allowed.has("expenses");
  const canExpensesUsers = allowed.has("expenses users");
  const activePath = canExpenses ? "/next/expenses" : canExpensesUsers ? "/next/expenses/users" : "/next/home";
  const payload = getResource(resources, "/api/orders/order-receipts", { ok: true, items: [], ids: ids.split(",") });

  return (
    <AppShell
      account={account}
      title="Order Receipts"
      eyebrow="Expense-linked proof and delivery files"
      activePath={activePath}
      classicHrefOverride={`/orders/order-receipt-viewer?ids=${encodeURIComponent(ids)}`}
    >
      <OrderReceiptViewerClient
        ids={ids}
        initialPayload={payload}
        canExpenses={canExpenses}
        canExpensesUsers={canExpensesUsers}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
