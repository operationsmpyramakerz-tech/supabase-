import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import ProductsClient from "../../components/products/ProductsClient";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { getProductsCatalog } from "../../lib/products-service";

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
    if (url === prefix || url.startsWith(prefix)) return body;
  }
  return fallback;
}

export default async function ProductsPage() {
  // During the incremental migration Express remains the temporary auth /
  // permission gate, but the Products catalogue itself is loaded directly by
  // the Next.js server from Supabase. This removes the Products read path from
  // the legacy Express data layer without changing the existing session model.
  const [gate, catalogResult] = await Promise.allSettled([
    fetchLegacyJson("/api/page-bootstrap?scope=products", { timeoutMs: 35000 }),
    getProductsCatalog(),
  ]);

  const response = gate.status === "fulfilled"
    ? gate.value
    : { ok: false, status: 503, data: null, error: gate.reason?.message || "The ERP authentication service is unavailable." };

  if (response.status === 401) redirect("/login?next=/next/products");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Products is not available</h1>
          <p>Your account does not have access to the Products module.</p>
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
          <h1>The new Products page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP authentication service is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/products?classic=1">Open classic Products</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  if (!account) redirect("/login?next=/next/products");

  const catalog = catalogResult.status === "fulfilled"
    ? catalogResult.value
    : {
        ok: false,
        source: "supabase-next",
        products: [],
        tagsCatalog: [],
        unitsCatalog: [],
        error: catalogResult.reason?.message || "Failed to load products from Supabase.",
      };

  return (
    <AppShell
      account={account}
      title="Products"
      eyebrow="Live product catalogue"
      activePath="/next/products"
      bodyClass="products-page"
      classicStyles={["/css/products.css?v=products-manual-image-v1"]}
    >
      <ProductsClient
        initialCatalog={catalog}
        bootstrapWarnings={[
          ...(response.data.omitted || []),
          ...(!catalog.ok && catalog.error ? [{ url: "/next/api/products", error: catalog.error }] : []),
        ]}
      />
    </AppShell>
  );
}
