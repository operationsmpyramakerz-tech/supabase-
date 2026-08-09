import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import CurrentOrdersClient from "../../components/orders/CurrentOrdersClient";
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

export default async function CurrentOrdersPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=current-orders", { timeoutMs: 30000 });

  if (response.status === 401) redirect("/login?next=/next/orders");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Current Orders is not available</h1>
          <p>Your account does not have access to the Current Orders page.</p>
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
          <h1>The new Current Orders page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/orders?classic=1">Open classic Current Orders</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const orders = getResource(resources, "/api/orders", []);

  if (!account) redirect("/login?next=/next/orders");

  return (
    <AppShell
      account={account}
      title="Current Orders"
      eyebrow="Live order portfolio"
      activePath="/next/orders"
      bodyClass="order-modal-fit-screen current-orders-page"
    >
      <CurrentOrdersClient
        initialOrders={Array.isArray(orders) ? orders : []}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
