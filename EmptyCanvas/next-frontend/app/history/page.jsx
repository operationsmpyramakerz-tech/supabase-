import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import HistoryClient from "../../components/history/HistoryClient";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { historyList } from "../../lib/history-data";
import { getLegacyAccountGate } from "../../lib/products-auth";

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

async function legacyHistoryPayload() {
  const response = await fetchLegacyJson("/api/history?limit=1000", { timeoutMs: 20_000, fresh: true });
  if (!response.ok || !response.data) return null;
  return response.data;
}

export default async function HistoryPage() {
  const gate = await getLegacyAccountGate(["History"]);

  if (gate.status === 401) redirect("/login?next=/next/history");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to the History module." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The current ERP authentication service is temporarily unavailable."} />;
  }

  const warnings = [];
  let historyPayload = null;

  try {
    historyPayload = await historyList({ limit: 1000 });
  } catch (directError) {
    historyPayload = await legacyHistoryPayload();
    if (!historyPayload) {
      return <UnavailableState message={directError?.message || "System History data is temporarily unavailable."} />;
    }
    warnings.push("History list loaded through the compatibility path.");
  }

  if (!historyPayload) {
    historyPayload = await legacyHistoryPayload();
    if (!historyPayload) return <UnavailableState message="System History data is temporarily unavailable." />;
    warnings.push("History list loaded through the compatibility path.");
  }

  return (
    <AppShell
      account={gate.account}
      title="History"
      eyebrow="Audit trail and operational accountability"
      activePath="/next/history"
    >
      <HistoryClient
        account={gate.account}
        initialRows={Array.isArray(historyPayload?.rows) ? historyPayload.rows : []}
        bootstrapWarnings={warnings}
      />
    </AppShell>
  );
}
