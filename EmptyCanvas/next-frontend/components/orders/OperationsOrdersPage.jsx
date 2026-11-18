import { redirect } from "next/navigation";
import AppShell from "../AppShell";
import OperationsOrdersClient from "./OperationsOrdersClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import { featureGate } from "../../lib/feature-permissions-server";
import { directPageMutationAccess } from "../../lib/order-action-auth";
import { loadOperationsOrdersInitialPage } from "../../lib/operations-orders-data";
import { orderUiScopePolicy } from "../../lib/order-data-scope";

function UnavailableState({ message, forbidden = false, activePath }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Operations Orders is not available" : "The new Operations Orders page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href={activePath}>Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function OperationsOrdersPage({ workspace }) {
  const { type, route: activePath, label: title } = workspace;
  // Phase 18 cutover: keep both authentication and order reads on the Next
  // migration path. The order data itself no longer uses Express bootstrap.
  const gate = featureGate(await getLegacyAccountGate(["Requested Orders", "Operations Orders"]), "orders.operations.view");
  if (gate.status === 401) redirect(`/login?next=${encodeURIComponent(activePath)}`);
  if (gate.status === 403) {
    return <UnavailableState activePath={activePath} forbidden message="Your account does not have access to Operations Orders." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState activePath={activePath} message={gate.error || "The account service is temporarily unavailable."} />;
  }
  const directResult = await loadOperationsOrdersInitialPage({ account: gate.account, type })
    .then((payload) => ({ payload, error: null }))
    .catch((error) => ({ payload: null, error }));
  if (!directResult?.payload) {
    return <UnavailableState activePath={activePath} message={directResult?.error?.message || "Operations Orders direct Supabase data is unavailable."} />;
  }

  const scopePolicy = await orderUiScopePolicy(gate.account, {
    details: "orders.operations.details", approve: "orders.operations.approve", ship: "orders.operations.ship",
    receive: "orders.operations.receive", send_to_stock: "orders.operations.send_to_stock", withdrawal: "orders.operations.withdrawal",
    delivery: "orders.operations.delivery", edit: "orders.operations.edit",
    delete: "orders.operations.delete",
    upload_receipt: "orders.operations.upload_receipt", export: "orders.operations.export",
  });
  const editPage = directPageMutationAccess(gate.account, ["Requested Orders", "Operations Orders"]) === true;
  const ordersPayload = directResult.payload;
  const orders = Array.isArray(ordersPayload)
    ? ordersPayload
    : (Array.isArray(ordersPayload?.items) ? ordersPayload.items : []);
  const pageInfo = !Array.isArray(ordersPayload) && ordersPayload?.pageInfo ? ordersPayload.pageInfo : null;

  return (
    <AppShell
      account={gate.account}
      title={title}
      eyebrow="Operations fulfilment workspace"
      bodyClass="order-modal-fit-screen operations-orders-page"
      activePath={activePath}
    >
      <OperationsOrdersClient
        key={type}
        orderType={type}
        initialOrders={Array.isArray(orders) ? orders : []}
        initialPageInfo={pageInfo}
        scopePolicy={scopePolicy}
        bootstrapWarnings={[]}
        permissions={Object.fromEntries([
          ["details", "orders.operations.details"],
          ["approve", "orders.operations.approve"],
          ["ship", "orders.operations.ship"],
          ["receive", "orders.operations.receive"],
          ["send_to_stock", "orders.operations.send_to_stock"],
          ["withdrawal", "orders.operations.withdrawal"],
          ["delivery", "orders.operations.delivery"],
          ["edit", "orders.operations.edit"],
          ["delete", "orders.operations.delete"],
          ["upload_receipt", "orders.operations.upload_receipt"],
          ["export", "orders.operations.export"],
          ["maintenance_log", "orders.maintenance.log"],
          ["maintenance_arrive", "orders.maintenance.mark_arrived"],
        ].map(([name, key]) => [name, featureAllowed(gate.account, key) && (["details", "export"].includes(name) || editPage)]))}
      />
    </AppShell>
  );
}
