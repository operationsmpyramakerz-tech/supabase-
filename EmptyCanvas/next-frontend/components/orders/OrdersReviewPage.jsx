import { redirect } from "next/navigation";
import { featureGate } from "../../lib/feature-permissions-server";
import AppShell from "../../components/AppShell";
import OrdersReviewClient from "../../components/orders/OrdersReviewClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { getDirectAccountGateFromSessionContext } from "../../lib/direct-session-account";
import { loadOrdersReviewInitialPage } from "../../lib/orders-review-data";

export const dynamic = "force-dynamic";

function UnavailableState({ message, forbidden = false, activePath = "/next/orders-review" }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Orders Review is not available" : "The new Orders Review page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href={activePath}>Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function OrdersReviewPage({ workspace, searchParams } = {}) {
  const { type, route: activePath, label: title } = workspace;
  const params = await Promise.resolve(searchParams || {});
  const rawOrder = typeof params.q === "string" ? params.q.trim() : "";
  // A notification can be opened while Orders Review is already mounted.
  // Remount its filter state for a different exact order number rather than
  // leaving the previous tab/query active after same-page navigation.
  const reviewLinkKey = /^ORD-\d+$/i.test(rawOrder) ? rawOrder.toUpperCase() : "review";
  // Phase 51 performance: the verified session gives us the reviewer identity
  // immediately. Refresh page permission and load the first review page in
  // parallel, but never render the payload unless the fresh gate allows it.
  const sessionGate = await getLegacyAccountGate([], { authOnly: true });

  if (sessionGate.status === 401) redirect(`/login?next=${encodeURIComponent(activePath)}`);
  if (!sessionGate.ok || !sessionGate.account) {
    return <UnavailableState activePath={activePath} message={sessionGate.error || "The account service is temporarily unavailable."} />;
  }

  const [gate, directResult] = await Promise.all([
    getDirectAccountGateFromSessionContext(sessionGate, ["Orders Review"]).then(gate => featureGate(gate, "orders.review.view")),
    loadOrdersReviewInitialPage({ account: sessionGate.account, type })
      .then((payload) => ({ payload, error: null }))
      .catch((error) => ({ payload: null, error })),
  ]);

  if (!gate) {
    return <UnavailableState activePath={activePath} message="The account permission service is temporarily unavailable." />;
  }
  if (gate.status === 403) {
    return <UnavailableState activePath={activePath} forbidden message="Your account does not have access to the Orders Review page." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState activePath={activePath} message={gate.error || "The account service is temporarily unavailable."} />;
  }

  const activePayload = directResult?.payload;
  if (!activePayload) {
    return <UnavailableState activePath={activePath} message={directResult?.error?.message || "Orders Review direct Supabase data is unavailable."} />;
  }

  const orders = Array.isArray(activePayload)
    ? activePayload
    : (Array.isArray(activePayload?.items) ? activePayload.items : []);
  const pageInfo = !Array.isArray(activePayload) && activePayload?.pageInfo ? activePayload.pageInfo : null;

  return (
    <AppShell
      account={gate.account}
      title={title}
      eyebrow="Supervisor approval workspace"
      activePath={activePath}
      bodyClass="order-modal-fit-screen orders-review-page"
    >
      <OrdersReviewClient
        key={`${type}:${reviewLinkKey}`}
        workspaceType={type}
        initialOrders={orders}
        initialPageInfo={pageInfo}
        bootstrapWarnings={[]}
        account={gate.account}
      />
    </AppShell>
  );
}
