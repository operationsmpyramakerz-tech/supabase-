import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import ExpensesClient from "../../components/expenses/ExpensesClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

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
    if (url === prefix || url.startsWith(prefix)) return body;
  }
  return fallback;
}

export default async function ExpensesPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=expenses", { timeoutMs: 35000 });

  if (response.status === 401) redirect("/login?next=/next/expenses");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Expenses is not available</h1>
          <p>Your account does not have access to the Expenses module.</p>
          <a className="primary-button" href="/next/home">Return to Home</a>
        </section>
      </main>
    );
  }

  if (!response.ok || !response.data?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new Expenses page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/expenses">Open classic Expenses</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const expensePayload = getResource(resources, "/api/expenses", { success: true, items: [] });
  const typesPayload = getResource(resources, "/api/expenses/types", { success: true, options: [] });
  const cashInFromPayload = getResource(resources, "/api/expenses/cash-in-from/options", { success: true, options: [] });
  const ordersPayload = getResource(resources, "/api/expenses/orders/options", { success: true, options: [] });

  if (!account) redirect("/login?next=/next/expenses");

  return (
    <AppShell account={account} title="Expenses" eyebrow="Live cash-flow workspace" activePath="/next/expenses">
      <ExpensesClient
        account={account}
        initialPayload={expensePayload || { success: true, items: [] }}
        initialTypes={Array.isArray(typesPayload?.options) ? typesPayload.options : []}
        cashInFromOptions={Array.isArray(cashInFromPayload?.options) ? cashInFromPayload.options : []}
        orderOptions={Array.isArray(ordersPayload?.options) ? ordersPayload.options : []}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
