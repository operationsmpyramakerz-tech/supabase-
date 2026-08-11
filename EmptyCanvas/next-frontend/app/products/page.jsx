import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import ProductsClient from "../../components/products/ProductsClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { getProductsCatalog } from "../../lib/products-service";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  // Express/Redis remains only as the temporary session + permission bridge.
  // Products data is loaded directly from Supabase by the Next.js server.
  const [gateResult, catalogResult] = await Promise.allSettled([
    getLegacyAccountGate("Products"),
    getProductsCatalog(),
  ]);

  const gate = gateResult.status === "fulfilled"
    ? gateResult.value
    : { ok: false, status: 503, account: null, error: gateResult.reason?.message || "The ERP authentication service is unavailable." };

  if (gate.status === 401) redirect("/login?next=/next/products");
  if (gate.status === 403) {
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

  if (!gate.ok || !gate.account) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new Products page could not load</h1>
          <p>{gate.error || "The current ERP authentication service is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/products?classic=1">Open classic Products</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

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
      account={gate.account}
      title="Products"
      eyebrow="Live product catalogue"
      activePath="/next/products"
      bodyClass="products-page"
      classicStyles={["/css/products.css?v=products-manual-image-v1"]}
    >
      <ProductsClient
        initialCatalog={catalog}
        bootstrapWarnings={!catalog.ok && catalog.error ? [{ url: "/next/api/products", error: catalog.error }] : []}
      />
    </AppShell>
  );
}
