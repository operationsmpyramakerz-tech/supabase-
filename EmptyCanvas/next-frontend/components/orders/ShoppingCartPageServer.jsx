import { redirect } from "next/navigation";
import AppShell from "../AppShell";
import ShoppingCartClient from "./ShoppingCartClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { loadShoppingCartInitialData } from "../../lib/shopping-cart-data";

function StateCard({ title, message, publicPath, retry = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="actions">
          {retry ? <a className="primary-button" href={publicPath}>Try again</a> : null}
          <a className={retry ? "secondary-button" : "primary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function ShoppingCartPageServer({
  searchParams,
  flow,
  initialType,
  title,
}) {
  const query = await Promise.resolve(searchParams);
  const editMode = String(query?.edit || "") === "1";
  const editKey = String(query?.editKey || "").trim();
  const publicPath = `/next/orders/new/${flow}`;
  const loginParams = new URLSearchParams();
  if (editMode) loginParams.set("edit", "1");
  if (editKey) loginParams.set("editKey", editKey);
  const loginNext = `${publicPath}${loginParams.toString() ? `?${loginParams.toString()}` : ""}`;

  const gate = await getLegacyAccountGate(["Create New Order"]);
  if (!gate.ok && gate.status === 401) redirect(`/login?next=${encodeURIComponent(loginNext)}`);
  if (!gate.ok && gate.status === 403) {
    return (
      <StateCard
        title="Shopping Cart is not available"
        message="Your account does not have access to Create New Order."
        publicPath={publicPath}
      />
    );
  }
  if (!gate.ok || !gate.account) {
    return (
      <StateCard
        title="The new Shopping Cart could not load"
        message={gate.error || "The authentication service is temporarily unavailable."}
        publicPath={publicPath}
        retry
      />
    );
  }

  let initial;
  try {
    initial = await loadShoppingCartInitialData();
  } catch (error) {
    return (
      <StateCard
        title="The new Shopping Cart could not load"
        message={error?.message || "The product catalog is temporarily unavailable."}
        publicPath={publicPath}
        retry
      />
    );
  }

  return (
    <AppShell
      account={gate.account}
      title={title}
      eyebrow="Create, withdraw, or maintain products"
      activePath={publicPath}
      bodyClass="shopping-cart-page"
    >
      <ShoppingCartClient
        key={`${flow}:${editMode ? "edit" : "new"}:${editKey}`}
        initialOrderTypes={initial.orderTypes}
        initialComponents={initial.components}
        initialDraft={null}
        initialType={initialType}
        editMode={editMode}
        editKey={editKey}
        bootstrapWarnings={[]}
      />
    </AppShell>
  );
}
