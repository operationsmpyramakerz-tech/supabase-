import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import HistoryClient from "../../components/history/HistoryClient";
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

export default async function HistoryPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=history", { timeoutMs: 45000 });

  if (response.status === 401) redirect("/login?next=/next/history");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>System History is not available</h1>
          <p>Your account does not have access to the History module.</p>
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
          <h1>The new History page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/history">Open classic History</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const historyPayload = getResource(resources, "/api/history", { ok: true, rows: [] });
  if (!account) redirect("/login?next=/next/history");

  return (
    <AppShell
      account={account}
      title="System History"
      eyebrow="Audit trail and operational accountability"
      activePath="/next/history"
    >
      <HistoryClient
        account={account}
        initialRows={Array.isArray(historyPayload?.rows) ? historyPayload.rows : []}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
