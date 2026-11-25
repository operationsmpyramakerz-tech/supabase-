// MY_ORDERS_THREE_WORKSPACES_V1
import { redirect } from "next/navigation";
import { myOrderExplicitPage, myOrderFilters, myOrderLegacyDestination, myOrderPageForType } from "../../lib/my-order-pages.mjs";
import AppShell from "../../components/AppShell";
import CurrentOrdersClient from "../../components/orders/CurrentOrdersClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { featureGate } from "../../lib/feature-permissions-server";
import { orderActionAllowed } from "../../lib/current-shopping-action-permissions.mjs";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import { getDirectAccountGateFromSessionContext } from "../../lib/direct-session-account";
import { loadCurrentOrdersInitialPage } from "../../lib/current-orders-data";
import { orderUiScopePolicy } from "../../lib/order-data-scope";

export const dynamic = "force-dynamic";

function UnavailableState({ message, forbidden = false, activePath = "/next/orders" }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "My Orders is not available" : "The new My Orders page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href={activePath}>Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function CurrentOrdersPage({ workspace = null, searchParams } = {}) {
  const params = await Promise.resolve(searchParams || {});
  const { tab, query } = myOrderFilters(params);
  const activePath = workspace?.route || "/next/orders";
  const title = workspace?.label || "My Orders";
  // Preserve old bookmarks with an explicit type; resolve old order-number
  // notification links after the normal My Orders access checks.
  if (!workspace && (myOrderExplicitPage(params) || !query)) redirect(myOrderLegacyDestination(params));
  // Phase 51 performance: validate the signed session first, then overlap the
  // fresh permission matrix with the first Current Orders query. The order
  // payload is never rendered unless the fresh page-access gate succeeds.
  const sessionGate = await getLegacyAccountGate([], { authOnly: true });

  if (sessionGate.status === 401) redirect(`/login?next=${encodeURIComponent(activePath + (query ? `?q=${encodeURIComponent(query)}` : ""))}`);
  if (!sessionGate.ok || !sessionGate.account) {
    return <UnavailableState activePath={activePath} message={sessionGate.error || "The account service is temporarily unavailable."} />;
  }

  const gate = await getDirectAccountGateFromSessionContext(sessionGate, ["Current Orders"]);

  if (!gate) {
    return <UnavailableState activePath={activePath} message="The account permission service is temporarily unavailable." />;
  }
  if (gate.status === 403) {
    return <UnavailableState activePath={activePath} forbidden message="Your account does not have access to the My Orders page." />;
  }
  const featureViewGate = featureGate(gate, "orders.my.view");
  if (!featureViewGate.ok && featureViewGate.status === 403) return <UnavailableState activePath={activePath} forbidden message="Your account does not have permission to view My Orders." />;
  if (!gate.ok || !gate.account) {
    return <UnavailableState activePath={activePath} message={gate.error || "The account service is temporarily unavailable."} />;
  }

  if (!workspace) {
    const legacy = await loadCurrentOrdersInitialPage({ account: gate.account, query, limit: 1 }).catch(() => null);
    const items = Array.isArray(legacy?.items) ? legacy.items : [];
    const matched = myOrderPageForType(items.find(item => item?.orderType)?.orderType);
    redirect(myOrderLegacyDestination(params, matched));
  }

  const directResult = await loadCurrentOrdersInitialPage({ account: gate.account, type: workspace.type, tab, query })
    .then((payload) => ({ payload, error: null }))
    .catch((error) => ({ payload: null, error }));
  const ordersPayload = directResult?.payload;
  if (!ordersPayload) {
    return <UnavailableState activePath={activePath} message={directResult?.error?.message || "My Orders direct Supabase data is unavailable."} />;
  }

  const scopePolicy = await orderUiScopePolicy(gate.account, {
    details: "orders.my.view_details", edit: "orders.my.edit", archive: "orders.my.archive", unarchive: "orders.my.unarchive",
    delete: "orders.my.delete", export: "orders.my.export",
  });
  const orders = Array.isArray(ordersPayload)
    ? ordersPayload
    : (Array.isArray(ordersPayload?.items) ? ordersPayload.items : []);
  const pageInfo = !Array.isArray(ordersPayload) && ordersPayload?.pageInfo ? ordersPayload.pageInfo : null;

  return (
    <AppShell
      account={gate.account}
      title={title}
      eyebrow="Live order portfolio"
      activePath={activePath}
      bodyClass="order-modal-fit-screen current-orders-page"
    >
      <CurrentOrdersClient
        key={JSON.stringify([workspace.type, tab, query])}
        workspaceType={workspace.type}
        initialTab={tab}
        initialQuery={query}
        initialOrders={Array.isArray(orders) ? orders : []}
        initialPageInfo={pageInfo}
        scopePolicy={scopePolicy}
        bootstrapWarnings={[]}
        permissions={Object.fromEntries([
          ["view_details", "orders.my.view_details"], ["edit", "orders.my.edit"], ["archive", "orders.my.archive"],
          ["unarchive", "orders.my.unarchive"], ["delete", "orders.my.delete"],
          ["export", "orders.my.export"],
        ].map(([action, key]) => [action, ["edit", "archive", "unarchive", "delete"].includes(action)
          ? orderActionAllowed(gate.account, key)
          : featureAllowed(gate.account, key)]))}
      />
    </AppShell>
  );
}
