import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import OrderTrackingClient from "../../../components/orders/OrderTrackingClient";
import { fetchLegacyJson } from "../../../lib/legacy-api";

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
    if (url === prefix || url.startsWith(`${prefix}?`)) return body;
  }
  return fallback;
}

export default async function OrderTrackingPage({ searchParams }) {
  const resolvedSearch = await Promise.resolve(searchParams);
  const groupId = String(resolvedSearch?.groupId || resolvedSearch?.group || "").trim();
  const currentPath = groupId
    ? `/next/orders/tracking?groupId=${encodeURIComponent(groupId)}`
    : "/next/orders/tracking";

  if (!groupId) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Order reference is missing</h1>
          <p>Open Order Tracking from a Current Orders card or a linked order so the tracking reference is included.</p>
          <div className="actions">
            <a className="primary-button" href="/next/orders">Open Current Orders</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const query = new URLSearchParams({ scope: "order-tracking", groupId });
  const response = await fetchLegacyJson(`/api/page-bootstrap?${query.toString()}`, { timeoutMs: 35000 });

  if (response.status === 401) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Order Tracking is not available</h1>
          <p>Your account does not have access to Current Orders.</p>
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
          <h1>Order Tracking could not load</h1>
          <p>{response.error || response.data?.error || "The ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/next/orders">Return to Current Orders</a>
            <a className="secondary-button" href="/orders?classic=1">Open classic Current Orders</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const tracking = getResource(resources, "/api/orders/tracking", null);

  if (!account) redirect(`/login?next=${encodeURIComponent(currentPath)}`);

  if (!tracking) {
    const missing = Array.isArray(response.data?.omitted)
      ? response.data.omitted.some((item) => String(item?.code || "") === "404")
      : false;
    return (
      <AppShell
        account={account}
        title="Order Tracking"
        eyebrow="Current Orders delivery journey"
        activePath="/next/orders"
        classicHrefOverride="/orders"
      >
        <main className="standalone-state standalone-state--inside">
          <section className="state-card">
            <span className="status-dot warning" />
            <h1>{missing ? "Order not found" : "Tracking data is temporarily unavailable"}</h1>
            <p>{missing ? "The selected order is no longer available to this account." : "The page opened, but the tracking resource could not be loaded."}</p>
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
      account={account}
      title="Order Tracking"
      eyebrow="Current Orders delivery journey"
      activePath="/next/orders"
      classicHrefOverride="/orders"
    >
      <OrderTrackingClient
        initialTracking={tracking}
        groupId={groupId}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
