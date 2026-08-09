import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import StocktakingClient from "../../components/stocktaking/StocktakingClient";
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

export default async function StocktakingPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=stocktaking", { timeoutMs: 30000 });

  if (response.status === 401) redirect("/login?next=/next/stocktaking");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Stocktaking is not available</h1>
          <p>Your account does not have access to Stocktaking.</p>
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
          <h1>The new Stocktaking page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/stocktaking?classic=1">Open classic Stocktaking</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const stock = getResource(resources, "/api/stock", []);

  if (!account) redirect("/login?next=/next/stocktaking");

  return (
    <AppShell
      account={account}
      title="Stocktaking"
      eyebrow="Live inventory overview"
      activePath="/next/stocktaking"
    >
      <StocktakingClient
        initialStock={Array.isArray(stock) ? stock : []}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
