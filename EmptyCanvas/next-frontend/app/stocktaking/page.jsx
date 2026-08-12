import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import StocktakingClient from "../../components/stocktaking/StocktakingClient";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { stocktakingForAccount } from "../../lib/stocktaking-data";

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
          {!forbidden ? <a className="primary-button" href="/stocktaking?classic=1">Open classic Stocktaking</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function StocktakingPage() {
  const gate = await getLegacyAccountGate(["Stocktaking"]);

  if (gate.status === 401) redirect("/login?next=/next/stocktaking");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to Stocktaking." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The current ERP authentication service is temporarily unavailable."} />;
  }

  let stock = [];
  const warnings = [];
  try {
    stock = await stocktakingForAccount(gate.account);
  } catch (directError) {
    // Temporary rollback path while the Stocktaking migration is being proven in production.
    const fallback = await fetchLegacyJson("/api/stock", { timeoutMs: 15000 });
    if (fallback.status === 401) redirect("/login?next=/next/stocktaking");
    if (fallback.ok && Array.isArray(fallback.data)) {
      stock = fallback.data;
      warnings.push("Stocktaking recovery path used.");
    } else {
      return (
        <UnavailableState
          message={directError?.message || fallback.error || fallback.data?.error || "Stocktaking data is temporarily unavailable."}
        />
      );
    }
  }

  return (
    <AppShell
      account={gate.account}
      title="Stocktaking"
      eyebrow="Live inventory overview"
      activePath="/next/stocktaking"
      bodyClass="stocktaking-page"
    >
      <StocktakingClient
        initialStock={Array.isArray(stock) ? stock : []}
        bootstrapWarnings={warnings}
      />
    </AppShell>
  );
}
