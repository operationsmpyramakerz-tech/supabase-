import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import CurrentOrdersNextBridge from "../../components/orders/CurrentOrdersNextBridge";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { currentOrdersForAccount } from "../../lib/orders-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Current Orders is not available" : "The new Current Orders page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/orders?classic=1">Open classic Current Orders</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

async function legacyOrdersFallback() {
  const response = await fetchLegacyJson("/api/orders?_fresh=1", { timeoutMs: 20000 });
  return response.ok && Array.isArray(response.data) ? response.data : null;
}

export default async function CurrentOrdersPage() {
  const gate = await getLegacyAccountGate(["Current Orders"]);

  if (gate.status === 401) redirect("/login?next=/next/orders");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to the Current Orders page." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The current ERP authentication service is temporarily unavailable."} />;
  }

  const warnings = [];
  let orders;

  try {
    orders = await currentOrdersForAccount(gate.account);
  } catch (directError) {
    orders = await legacyOrdersFallback();
    if (!orders) {
      return <UnavailableState message={directError?.message || "Current Orders data is temporarily unavailable."} />;
    }
    warnings.push("Current Orders recovery path used.");
  }

  return (
    <AppShell
      account={gate.account}
      title="Current Orders"
      eyebrow="Live order portfolio"
      activePath="/next/orders"
      bodyClass="order-modal-fit-screen current-orders-page"
    >
      <CurrentOrdersNextBridge
        initialOrders={Array.isArray(orders) ? orders : []}
        bootstrapWarnings={warnings}
      />
    </AppShell>
  );
}
