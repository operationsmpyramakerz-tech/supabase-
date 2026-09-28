import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import OrderTrackingClient from "../../../components/orders/OrderTrackingClient";
import { getLegacyAccountGate } from "../../../lib/products-auth";
import { getDirectAccountGateFromSessionContext } from "../../../lib/direct-session-account";
import { loadOrderTracking } from "../../../lib/order-tracking-data";

export const dynamic = "force-dynamic";

function StandaloneState({ title, message, primaryHref = "/next/orders", primaryLabel = "Return to Current Orders", secondaryHref = "" }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="actions">
          <a className="primary-button" href={primaryHref}>{primaryLabel}</a>
          {secondaryHref ? <a className="secondary-button" href={secondaryHref}>Refresh the page</a> : null}
        </div>
      </section>
    </main>
  );
}

export default async function OrderTrackingPage({ searchParams }) {
  const resolvedSearch = await Promise.resolve(searchParams);
  const groupId = String(resolvedSearch?.groupId || resolvedSearch?.group || "").trim();
  const currentPath = groupId
    ? `/next/orders/tracking?groupId=${encodeURIComponent(groupId)}`
    : "/next/orders/tracking";

  if (!groupId) {
    return (
      <StandaloneState
        title="Order reference is missing"
        message="Open Order Tracking from a Current Orders card or a linked order so the tracking reference is included."
        primaryHref="/next/orders"
        primaryLabel="Open Current Orders"
      />
    );
  }

  const sessionGate = await getLegacyAccountGate([], { authOnly: true });
  if (!sessionGate.ok && sessionGate.status === 401) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  if (!sessionGate.ok || !sessionGate.account) {
    return (
      <StandaloneState
        title="Order Tracking could not load"
        message={sessionGate.error || "The authentication service is temporarily unavailable."}
        secondaryHref={currentPath}
      />
    );
  }

  const [gate, trackingResult] = await Promise.all([
    getDirectAccountGateFromSessionContext(sessionGate, ["Current Orders"]),
    loadOrderTracking({ account: sessionGate.account, groupId })
      .then((tracking) => ({ tracking, error: null }))
      .catch((error) => ({ tracking: null, error })),
  ]);

  if (!gate) {
    return (
      <StandaloneState
        title="Order Tracking could not load"
        message="The account permission service is temporarily unavailable."
        secondaryHref={currentPath}
      />
    );
  }
  if (!gate.ok && gate.status === 403) {
    return (
      <StandaloneState
        title="Order Tracking is not available"
        message="Your account does not have access to Current Orders."
        primaryHref="/next/home"
        primaryLabel="Return to Home"
      />
    );
  }
  if (!gate.ok || !gate.account) {
    return (
      <StandaloneState
        title="Order Tracking could not load"
        message={gate.error || "The authentication service is temporarily unavailable."}
        secondaryHref={currentPath}
      />
    );
  }

  const tracking = trackingResult?.tracking || null;
  const failure = trackingResult?.error || null;

  if (!tracking) {
    const missing = Number(failure?.status) === 404;
    return (
      <AppShell
        account={gate.account}
        title="Order Tracking"
        eyebrow="Current Orders delivery journey"
        activePath="/next/orders"
      >
        <main className="standalone-state standalone-state--inside">
          <section className="state-card">
            <span className="status-dot warning" />
            <h1>{missing ? "Order not found" : "Tracking data is temporarily unavailable"}</h1>
            <p>{missing ? "The selected order is no longer available to this account." : (failure?.message || "The tracking resource could not be loaded from Supabase.")}</p>
            <div className="actions">
              <a className="primary-button" href="/next/orders">Return to Current Orders</a>
              <a className="secondary-button" href={currentPath}>Refresh the page</a>
            </div>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell
      account={gate.account}
      title="Order Tracking"
      eyebrow="Current Orders delivery journey"
      activePath="/next/orders"
    >
      <OrderTrackingClient
        initialTracking={tracking}
        groupId={groupId}
        bootstrapWarnings={[]}
      />
    </AppShell>
  );
}
