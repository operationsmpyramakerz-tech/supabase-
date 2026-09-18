import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import OrderTrackingClient from "../../../components/orders/OrderTrackingClient";
import { fetchLegacyJson } from "../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../lib/products-auth";
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

  const gate = await getLegacyAccountGate(["Current Orders"]);
  if (!gate.ok && gate.status === 401) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
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

  let tracking = null;
  let failure = null;
  try {
    tracking = await loadOrderTracking({ account: gate.account, groupId });
  } catch (error) {
    failure = error;
  }

  if (!tracking) {
    const legacy = await fetchLegacyJson(`/api/orders/tracking?groupId=${encodeURIComponent(groupId)}`, { timeoutMs: 20_000 });
    if (legacy.ok && legacy.data) tracking = legacy.data;
    else {
      const status = legacy.status || failure?.status || 502;
      const missing = Number(status) === 404;
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
              <p>{missing ? "The selected order is no longer available to this account." : (legacy.error || legacy.data?.error || failure?.message || "The tracking resource could not be loaded.")}</p>
              <div className="actions">
                <a className="primary-button" href="/next/orders">Return to Current Orders</a>
                <a className="secondary-button" href={currentPath}>Refresh the page</a>
              </div>
            </section>
          </main>
        </AppShell>
      );
    }
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
