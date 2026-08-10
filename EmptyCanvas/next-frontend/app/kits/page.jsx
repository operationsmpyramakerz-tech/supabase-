import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import KitsClient from "../../components/kits/KitsClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

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

export default async function KitsPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=kits", { timeoutMs: 45000 });

  if (response.status === 401) redirect("/login?next=/next/kits");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Kits is not available</h1>
          <p>Your account does not have access to the Kits, Proposals or Products module.</p>
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
          <h1>The new Kits page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/kits?classic=1">Open classic Kits</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const catalog = getResource(resources, "/api/products", { ok: true, products: [], tagsCatalog: [], unitsCatalog: [] });
  const kits = getResource(resources, "/api/products/kits", { ok: true, kits: [] });

  if (!account) redirect("/login?next=/next/kits");

  return (
    <AppShell
      account={account}
      title="Kits"
      eyebrow="Reusable product bundles"
      activePath="/next/kits"
      bodyClass="products-page proposals-page kits-page"
      classicStyles={[
        "/css/products.css?v=products-manual-image-v1",
        "/css/proposals.css?v=b2b-addname-transparent-pdf-v1",
      ]}
    >
      <KitsClient
        account={account}
        initialCatalog={catalog}
        initialKits={kits}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
