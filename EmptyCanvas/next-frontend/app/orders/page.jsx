import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import CurrentOrdersClient from "../../components/orders/CurrentOrdersClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { getDirectAccountGateFromSessionContext } from "../../lib/direct-session-account";
import { loadCurrentOrdersInitialPage } from "../../lib/current-orders-data";

export const dynamic = "force-dynamic";

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "My Orders is not available" : "The new My Orders page could not load"}</h1>
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
  // Phase 51 performance: validate the signed session first, then overlap the
  // fresh permission matrix with the first Current Orders query. The order
  // payload is never rendered unless the fresh page-access gate succeeds.
  const sessionGate = await getLegacyAccountGate([], { authOnly: true });

  if (sessionGate.status === 401) redirect("/login?next=/next/orders");
  if (!sessionGate.ok || !sessionGate.account) {
    return <UnavailableState message={sessionGate.error || "The account service is temporarily unavailable."} />;
  }

  const [gate, directResult] = await Promise.all([
    getDirectAccountGateFromSessionContext(sessionGate, ["Current Orders"]),
    loadCurrentOrdersInitialPage({ account: sessionGate.account })
      .then((payload) => ({ payload, error: null }))
      .catch((error) => ({ payload: null, error })),
  ]);

  if (!gate) {
    return <UnavailableState message="The account permission service is temporarily unavailable." />;
  }
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to the My Orders page." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The account service is temporarily unavailable."} />;
  }

  const ordersPayload = directResult?.payload;
  if (!ordersPayload) {
    return <UnavailableState message={directResult?.error?.message || "My Orders direct Supabase data is unavailable."} />;
  }

  const orders = Array.isArray(ordersPayload)
    ? ordersPayload
    : (Array.isArray(ordersPayload?.items) ? ordersPayload.items : []);
  const pageInfo = !Array.isArray(ordersPayload) && ordersPayload?.pageInfo ? ordersPayload.pageInfo : null;

  return (
    <AppShell
      account={gate.account}
      title="My Orders"
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
