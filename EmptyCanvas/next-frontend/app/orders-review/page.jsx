import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import OrdersReviewClient from "../../components/orders/OrdersReviewClient";
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

export default async function OrdersReviewPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=orders-review", { timeoutMs: 30000 });

  if (response.status === 401) redirect("/login?next=/next/orders-review");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Orders Review is not available</h1>
          <p>Your account does not have access to the Orders Review page.</p>
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
          <h1>The new Orders Review page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/orders/sv-orders">Open classic Orders Review</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const activePayload = resources.get("/api/sv-orders?tab=all") ?? [];
  const archivedPayload = resources.get("/api/sv-orders?tab=archive") ?? [];
  const activeOrders = Array.isArray(activePayload)
    ? activePayload
    : (Array.isArray(activePayload?.items) ? activePayload.items : []);
  const archivedOrders = Array.isArray(archivedPayload)
    ? archivedPayload
    : (Array.isArray(archivedPayload?.items) ? archivedPayload.items : []);
  const orders = [...activeOrders, ...archivedOrders];

  if (!account) redirect("/login?next=/next/orders-review");

  return (
    <AppShell
      account={account}
      title="Orders Review"
      eyebrow="Supervisor approval workspace"
      activePath="/next/orders-review"
    >
      <OrdersReviewClient
        initialOrders={orders}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
