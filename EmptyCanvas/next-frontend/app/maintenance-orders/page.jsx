import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import MaintenanceOrdersClient from "../../components/orders/MaintenanceOrdersClient";
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

export default async function MaintenanceOrdersPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=maintenance-orders", { timeoutMs: 35000 });

  if (response.status === 401) redirect("/login?next=/next/maintenance-orders");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Maintenance Orders is not available</h1>
          <p>Your account does not have access to Maintenance Orders.</p>
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
          <h1>The new Maintenance Orders page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/orders/maintenance-orders">Open classic Maintenance Orders</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const orders = getResource(resources, "/api/orders/requested", []);
  const maintenanceOptions = getResource(resources, "/api/orders/requested/maintenance-form-options", {});

  if (!account) redirect("/login?next=/next/maintenance-orders");

  return (
    <AppShell
      account={account}
      title="Maintenance Orders"
      eyebrow="Technical maintenance workflow"
      activePath="/next/maintenance-orders"
    >
      <MaintenanceOrdersClient
        initialOrders={Array.isArray(orders) ? orders : []}
        initialOptions={maintenanceOptions && typeof maintenanceOptions === "object" ? maintenanceOptions : {}}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
