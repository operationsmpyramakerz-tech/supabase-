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

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Current Orders is not available" : "The new Current Orders page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/next/orders">Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function CurrentOrdersPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=current-orders", { timeoutMs: 25000 });

  if (response.status === 401) redirect("/login?next=/next/orders");
  if (response.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to the Current Orders page." />;
  }
  if (!response.ok || !response.data?.ok) {
    return <UnavailableState message={response.error || response.data?.error || "The current ERP API is temporarily unavailable."} />;
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
