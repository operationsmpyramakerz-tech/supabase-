import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import MaintenanceOrdersClient from "../../components/orders/MaintenanceOrdersClient";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { loadMaintenanceOrdersInitialPage } from "../../lib/maintenance-orders-data";

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
        <h1>{forbidden ? "Maintenance Orders is not available" : "The new Maintenance Orders page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/next/maintenance-orders">Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function MaintenanceOrdersPage() {
  // Fast path: resolve the signed-in account/permission in Next and load only
  // the first maintenance summary page directly from Supabase. Legacy
  // page-bootstrap stays available as a compatibility fallback.
  const gate = await getLegacyAccountGate(["Maintenance Orders"]);

  if (gate.status === 401) redirect("/login?next=/next/maintenance-orders");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to Maintenance Orders." />;
  }

  let account = gate.ok ? gate.account : null;
  let ordersPayload = gate.ok
    ? await loadMaintenanceOrdersInitialPage().catch(() => null)
    : null;
  let bootstrapWarnings = [];

  if (!gate.ok || !ordersPayload) {
    const response = await fetchLegacyJson("/api/page-bootstrap?scope=maintenance-orders", { timeoutMs: 25000 });

    if (response.status === 401) redirect("/login?next=/next/maintenance-orders");
    if (response.status === 403) {
      return <UnavailableState forbidden message="Your account does not have access to Maintenance Orders." />;
    }
    if (!response.ok || !response.data?.ok) {
      return <UnavailableState message={response.error || response.data?.error || gate.error || "The current ERP API is temporarily unavailable."} />;
    }

    const resources = resourceMap(response.data);
    account = getResource(resources, "/api/account", null);
    ordersPayload = getResource(resources, "/api/orders/requested", []);
    bootstrapWarnings = response.data.omitted || [];
  }

  const orders = Array.isArray(ordersPayload)
    ? ordersPayload
    : (Array.isArray(ordersPayload?.items) ? ordersPayload.items : []);
  const pageInfo = !Array.isArray(ordersPayload) && ordersPayload?.pageInfo ? ordersPayload.pageInfo : null;

  if (!account) redirect("/login?next=/next/maintenance-orders");

  return (
    <AppShell
      account={account}
      title="Maintenance Orders"
      eyebrow="Technical maintenance workflow"
      bodyClass="order-modal-fit-screen page-maintenance-orders page-orders-maintenance-orders"
      activePath="/next/maintenance-orders"
    >
      <MaintenanceOrdersClient
        initialOrders={Array.isArray(orders) ? orders : []}
        initialOptions={{}}
        initialPageInfo={pageInfo}
        bootstrapWarnings={bootstrapWarnings}
      />
    </AppShell>
  );
}
