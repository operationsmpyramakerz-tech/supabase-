import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import OperationsOrdersClient from "../../components/orders/OperationsOrdersClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { loadOperationsOrdersInitialPage } from "../../lib/operations-orders-data";

export const dynamic = "force-dynamic";

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Operations Orders is not available" : "The new Operations Orders page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/next/operations-orders">Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function OperationsOrdersPage() {
  // Phase 18 cutover: keep both authentication and order reads on the Next
  // migration path. The order data itself no longer uses Express bootstrap.
  const [gate, directResult] = await Promise.all([
    getLegacyAccountGate(["Requested Orders", "Operations Orders"]),
    loadOperationsOrdersInitialPage()
      .then((payload) => ({ payload, error: null }))
      .catch((error) => ({ payload: null, error })),
  ]);

  if (gate.status === 401) redirect("/login?next=/next/operations-orders");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to Operations Orders." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The account service is temporarily unavailable."} />;
  }
  if (!directResult?.payload) {
    return <UnavailableState message={directResult?.error?.message || "Operations Orders direct Supabase data is unavailable."} />;
  }

  const ordersPayload = directResult.payload;
  const orders = Array.isArray(ordersPayload)
    ? ordersPayload
    : (Array.isArray(ordersPayload?.items) ? ordersPayload.items : []);
  const pageInfo = !Array.isArray(ordersPayload) && ordersPayload?.pageInfo ? ordersPayload.pageInfo : null;

  return (
    <AppShell
      account={gate.account}
      title="Operations Orders"
      eyebrow="Operations fulfilment workspace"
      bodyClass="order-modal-fit-screen operations-orders-page"
      activePath="/next/operations-orders"
    >
      <OperationsOrdersClient
        initialOrders={Array.isArray(orders) ? orders : []}
        initialPageInfo={pageInfo}
        bootstrapWarnings={[]}
      />
    </AppShell>
  );
}
