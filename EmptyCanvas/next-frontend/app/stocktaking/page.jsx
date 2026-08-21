import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import StocktakingClient from "../../components/stocktaking/StocktakingClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Stocktaking is not available" : "The new Stocktaking page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/stocktaking?classic=1">Open classic Stocktaking</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

async function loadStocktakingBootstrap() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=stocktaking", { timeoutMs: 45000 });
  if (!response.ok || !response.data?.ok) return { response, account: null, columns: null, columnsError: "" };

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const bootstrapColumns = getResource(resources, "/api/stock/columns", null);
  let columns = bootstrapColumns?.ok && Array.isArray(bootstrapColumns?.columns) ? bootstrapColumns.columns : null;
  let columnsError = "";

  if (!Array.isArray(columns)) {
    const direct = await fetchLegacyJson("/api/stock/columns?_fresh=1", { timeoutMs: 30000 });
    if (direct.status === 401) return { response: direct, account: null, columns: null, columnsError: "" };
    if (direct.status === 403) return { response: direct, account, columns: null, columnsError: "" };
    if (direct.ok && direct.data?.ok && Array.isArray(direct.data?.columns)) {
      columns = direct.data.columns;
    } else {
      columnsError = direct.data?.error || direct.error || "Stocktaking columns are temporarily unavailable.";
    }
  }

  return { response, account, columns, columnsError };
}

export default async function StocktakingPage() {
  const { response, account, columns, columnsError } = await loadStocktakingBootstrap();

  if (response.status === 401) redirect("/login?next=/next/stocktaking");
  if (response.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to Stocktaking." />;
  }
  if (!response.ok || !response.data?.ok || !account || !Array.isArray(columns)) {
    return (
      <UnavailableState
        message={columnsError || response.error || response.data?.error || "Stocktaking data is temporarily unavailable."}
      />
    );
  }

  return (
    <AppShell
      account={account}
      title="Stocktaking"
      eyebrow="Live inventory overview"
      activePath="/next/stocktaking"
      classicHrefOverride="/stocktaking"
      bodyClass="stocktaking-page"
    >
      <StocktakingClient initialColumns={columns} />
    </AppShell>
  );
}
