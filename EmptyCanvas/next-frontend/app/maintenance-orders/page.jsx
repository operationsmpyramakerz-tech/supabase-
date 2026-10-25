import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import MaintenanceOrdersClient from "../../components/orders/MaintenanceOrdersClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { featureGate } from "../../lib/feature-permissions-server";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import { loadMaintenanceOrdersInitialPage } from "../../lib/maintenance-orders-data";
import { orderUiScopePolicy } from "../../lib/order-data-scope";

export const dynamic = "force-dynamic";

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
  const gate = featureGate(await getLegacyAccountGate(["Maintenance Orders"]), "orders.maintenance.view");
  if (gate.status === 401) redirect("/login?next=/next/maintenance-orders");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to Maintenance Orders." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The account service is temporarily unavailable."} />;
  }

  const directResult = await loadMaintenanceOrdersInitialPage({ account: gate.account })
    .then((payload) => ({ payload, error: null }))
    .catch((error) => ({ payload: null, error }));
  const scopePolicy = await orderUiScopePolicy(gate.account, {
    details: "orders.maintenance.details", log: "orders.maintenance.log",
    mark_arrived: "orders.maintenance.mark_arrived", edit: "orders.maintenance.edit",
    archive: "orders.maintenance.archive", delete: "orders.maintenance.delete",
    export: "orders.maintenance.export",
  }).catch(error => ({ error: error?.message || "Unable to verify maintenance permissions." }));
  if (scopePolicy?.error) return <UnavailableState message={scopePolicy.error} />;
  if (!directResult?.payload) {
    return <UnavailableState message={directResult?.error?.message || "Maintenance Orders direct Supabase data is unavailable."} />;
  }

  const ordersPayload = directResult.payload;
  const orders = Array.isArray(ordersPayload)
    ? ordersPayload
    : (Array.isArray(ordersPayload?.items) ? ordersPayload.items : []);
  const pageInfo = !Array.isArray(ordersPayload) && ordersPayload?.pageInfo ? ordersPayload.pageInfo : null;

  return (
    <AppShell
      account={gate.account}
      title="Maintenance Orders"
      eyebrow="Technical maintenance workflow"
      bodyClass="order-modal-fit-screen page-maintenance-orders page-orders-maintenance-orders"
      activePath="/next/maintenance-orders"
    >
      <MaintenanceOrdersClient
        permissions={Object.fromEntries(["view", "details", "log", "mark_arrived", "edit", "archive", "delete", "checklist_view", "checklist_manage", "export"].map(action => [action, featureAllowed(gate.account, `orders.maintenance.${action}`)]))}
        scopePolicy={scopePolicy}
        initialOrders={Array.isArray(orders) ? orders : []}
        initialOptions={{}}
        initialPageInfo={pageInfo}
        bootstrapWarnings={[]}
      />
    </AppShell>
  );
}
