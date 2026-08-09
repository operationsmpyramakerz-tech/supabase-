import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import ShoppingCartClient from "../../../components/orders/ShoppingCartClient";
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

export default async function ShoppingCartPage({ searchParams }) {
  const query = await Promise.resolve(searchParams);
  const initialType = String(query?.type || "").trim();
  const editMode = String(query?.edit || "") === "1";
  const editKey = String(query?.editKey || "").trim();
  const bootstrapUrl = `/api/page-bootstrap?scope=shopping-cart${initialType ? `&type=${encodeURIComponent(initialType)}` : ""}`;
  const response = await fetchLegacyJson(bootstrapUrl, { timeoutMs: 45000 });

  if (response.status === 401) redirect(`/login?next=${encodeURIComponent(`/next/orders/new${initialType ? `?type=${initialType}` : ""}`)}`);
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Shopping Cart is not available</h1>
          <p>Your account does not have access to Create New Order.</p>
          <div className="actions">
            <a className="primary-button" href="/next/home">Return to Home</a>
            <a className="secondary-button" href="/orders/new?classic=1">Open classic page</a>
          </div>
        </section>
      </main>
    );
  }

  if (!response.ok || !response.data?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new Shopping Cart could not load</h1>
          <p>{response.error || response.data?.error || "The ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/orders/new?classic=1">Open classic Shopping Cart</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account");
  if (!account) redirect("/login?next=/next/orders/new");

  const orderTypesPayload = getResource(resources, "/api/order-types", { options: [] });
  const componentsPayload = getResource(resources, "/api/components", []);
  const initialDraft = initialType
    ? getResource(resources, "/api/order-draft", null)
    : null;

  return (
    <AppShell
      account={account}
      title="Shopping Cart"
      eyebrow="Create, withdraw, or maintain products"
      activePath="/next/orders/new"
      classicHrefOverride="/orders/new"
      bodyClass="shopping-cart-page"
    >
      <ShoppingCartClient
        initialOrderTypes={Array.isArray(orderTypesPayload) ? orderTypesPayload : orderTypesPayload?.options || []}
        initialComponents={Array.isArray(componentsPayload) ? componentsPayload : componentsPayload?.items || []}
        initialDraft={initialDraft}
        initialType={initialType}
        editMode={editMode}
        editKey={editKey}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
