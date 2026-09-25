import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import OrdersReviewClient from "../../components/orders/OrdersReviewClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { loadOrdersReviewInitialPage } from "../../lib/orders-review-data";

export const dynamic = "force-dynamic";

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Orders Review is not available" : "The new Orders Review page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/next/orders-review">Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function OrdersReviewPage() {
  // Phase 18 cutover: the reviewer workspace now loads its first page directly
  // from Supabase and no longer uses the Express page-bootstrap recovery path.
  const gate = await getLegacyAccountGate(["Orders Review"]);

  if (gate.status === 401) redirect("/login?next=/next/orders-review");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to the Orders Review page." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The account service is temporarily unavailable."} />;
  }

  let activePayload = null;
  try {
    activePayload = await loadOrdersReviewInitialPage({ account: gate.account });
  } catch (error) {
    return <UnavailableState message={error?.message || "Orders Review could not be loaded from Supabase."} />;
  }
  if (!activePayload) {
    return <UnavailableState message="Orders Review direct Supabase data is unavailable." />;
  }

  const orders = Array.isArray(activePayload)
    ? activePayload
    : (Array.isArray(activePayload?.items) ? activePayload.items : []);
  const pageInfo = !Array.isArray(activePayload) && activePayload?.pageInfo ? activePayload.pageInfo : null;

  return (
    <AppShell
      account={gate.account}
      title="Orders Review"
      eyebrow="Supervisor approval workspace"
      activePath="/next/orders-review"
      bodyClass="order-modal-fit-screen orders-review-page"
    >
      <OrdersReviewClient
        initialOrders={orders}
        initialPageInfo={pageInfo}
        bootstrapWarnings={[]}
      />
    </AppShell>
  );
}
