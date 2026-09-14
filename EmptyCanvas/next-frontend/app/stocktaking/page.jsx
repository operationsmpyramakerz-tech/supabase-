import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import StocktakingClient from "../../components/stocktaking/StocktakingClient";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { listStocktakingFolders } from "../../lib/stocktaking-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Stocktaking is not available" : "The new Stocktaking page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/next/stocktaking">Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

async function loadInitialStocktakingColumns() {
  try {
    return { columns: await listStocktakingFolders(), error: "" };
  } catch (error) {
    const directError = error?.message || "Stocktaking columns are temporarily unavailable.";
    // Compatibility fallback only. Normal Supabase deployments stay entirely
    // on the direct Next read path. This fallback also runs independently of
    // the account gate so it does not reintroduce sequential startup latency.
    const legacy = await fetchLegacyJson("/api/stock/columns", { timeoutMs: 20_000 });
    if (legacy.ok && legacy.data?.ok && Array.isArray(legacy.data?.columns)) {
      return { columns: legacy.data.columns, error: "" };
    }
    return { columns: null, error: directError };
  }
}

export default async function StocktakingPage() {
  const gatePromise = getLegacyAccountGate(["Stocktaking"]);
  const columnsPromise = loadInitialStocktakingColumns();
  const gate = await gatePromise;

  if (gate.status === 401) redirect("/login?next=/next/stocktaking");
  if (!gate.ok && gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to Stocktaking." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "Stocktaking authentication is temporarily unavailable."} />;
  }

  const { columns, error: columnsError } = await columnsPromise;

  if (!Array.isArray(columns)) {
    return <UnavailableState message={columnsError || "Stocktaking data is temporarily unavailable."} />;
  }

  return (
    <AppShell
      account={gate.account}
      title="Stocktaking"
      eyebrow="Live inventory overview"
      activePath="/next/stocktaking"
      bodyClass="stocktaking-page"
    >
      <StocktakingClient initialColumns={columns} />
    </AppShell>
  );
}
