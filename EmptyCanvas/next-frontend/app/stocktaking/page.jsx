import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import StocktakingClient from "../../components/stocktaking/StocktakingClient";
import { getDirectAccountGate } from "../../lib/products-auth";
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

export default async function StocktakingPage() {
  const gate = await getDirectAccountGate(["Stocktaking"]);

  if (gate.status === 401) redirect("/login?next=/next/stocktaking");
  if (!gate.ok && gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to Stocktaking." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "Stocktaking authentication is temporarily unavailable."} />;
  }

  let columns;
  try {
    columns = await listStocktakingFolders({ account: gate.account });
  } catch (error) {
    return <UnavailableState message={error?.message || "Stocktaking data is temporarily unavailable."} />;
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
