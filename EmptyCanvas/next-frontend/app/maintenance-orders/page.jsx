import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import MaintenanceOrdersClient from "../../components/orders/MaintenanceOrdersClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { loadMaintenanceOrdersInitialPage } from "../../lib/maintenance-orders-data";

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
  // Phase 18 cutover: the page no longer falls back to Express page-bootstrap.
  const gate = await getLegacyAccountGate(["Maintenance Orders"]);

  if (gate.status === 401) redirect("/login?next=/next/maintenance-orders");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to Maintenance Orders." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The account service is temporarily unavailable."} />;
  }

  let ordersPayload = null;
  try {
    ordersPayload = await loadMaintenanceOrdersInitialPage();
  } catch (error) {
    return <UnavailableState message={error?.message || "Maintenance Orders could not be loaded from Supabase."} />;
  }
  if (!ordersPayload) {
    return <UnavailableState message="Maintenance Orders direct Supabase data is unavailable." />;
  }

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
        initialOrders={Array.isArray(orders) ? orders : []}
        initialOptions={{}}
        initialPageInfo={pageInfo}
        bootstrapWarnings={[]}
      />
    </AppShell>
  );
}
