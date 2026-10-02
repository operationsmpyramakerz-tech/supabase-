import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import HistoryClient from "../../components/history/HistoryClient";
import { historyList } from "../../lib/history-data";
import { getDirectAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "System History is not available" : "The new History page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/next/history">Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}

export default async function HistoryPage() {
  const gate = await getDirectAccountGate(["History"]);

  if (gate.status === 401) redirect("/login?next=/next/history");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to the History module." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The current ERP authentication service is temporarily unavailable."} />;
  }

  let historyPayload = null;
  try {
    historyPayload = await historyList({ limit: 1000, fresh: true });
  } catch (directError) {
    return <UnavailableState message={directError?.message || "System History data is temporarily unavailable."} />;
  }
  if (!historyPayload) return <UnavailableState message="System History data is temporarily unavailable." />;
  const warnings = [];

  return (
    <AppShell
      account={gate.account}
      title="History"
      eyebrow="Audit trail and operational accountability"
      activePath="/next/history"
    >
      <HistoryClient
        initialRows={Array.isArray(historyPayload?.rows) ? historyPayload.rows : []}
        bootstrapWarnings={warnings}
      />
    </AppShell>
  );
}
