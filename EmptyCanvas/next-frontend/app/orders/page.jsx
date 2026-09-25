import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import CurrentOrdersClient from "../../components/orders/CurrentOrdersClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { loadCurrentOrdersInitialPage } from "../../lib/current-orders-data";

export const dynamic = "force-dynamic";

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
  // Phase 18 cutover: Current Orders now renders from the Next/Supabase path
  // only. Express page-bootstrap is no longer part of the page read path.
  const gate = await getLegacyAccountGate(["Current Orders"]);

  if (gate.status === 401) redirect("/login?next=/next/orders");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to the Current Orders page." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The account service is temporarily unavailable."} />;
  }

  let ordersPayload = null;
  try {
    ordersPayload = await loadCurrentOrdersInitialPage({ account: gate.account });
  } catch (error) {
    return <UnavailableState message={error?.message || "Current Orders could not be loaded from Supabase."} />;
  }
  if (!ordersPayload) {
    return <UnavailableState message="Current Orders direct Supabase data is unavailable." />;
  }

  const orders = Array.isArray(ordersPayload)
    ? ordersPayload
    : (Array.isArray(ordersPayload?.items) ? ordersPayload.items : []);
  const pageInfo = !Array.isArray(ordersPayload) && ordersPayload?.pageInfo ? ordersPayload.pageInfo : null;

  return (
    <AppShell
      account={gate.account}
      title="Current Orders"
      eyebrow="Live order portfolio"
      activePath="/next/orders"
      bodyClass="order-modal-fit-screen current-orders-page"
    >
      <CurrentOrdersClient
        initialOrders={Array.isArray(orders) ? orders : []}
        initialPageInfo={pageInfo}
        bootstrapWarnings={[]}
      />
    </AppShell>
  );
}
