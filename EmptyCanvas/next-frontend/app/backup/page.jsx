import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import BackupClient from "../../components/backup/BackupClient";
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

export default async function BackupPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=backup", { timeoutMs: 30000 });

  if (response.status === 401) redirect("/login?next=/next/backup");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Database Backup is not available</h1>
          <p>Your account does not have access to the Backup module.</p>
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
          <h1>The new Database Backup page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/backup?classic=1">Open classic Database</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const backupPayload = getResource(resources, "/api/backup/tables", { ok: true, tables: [] });
  if (!account) redirect("/login?next=/next/backup");

  return (
    <AppShell
      account={account}
      title="Database"
      eyebrow="Backup, restore and database control"
      activePath="/next/backup"
      classicHrefOverride="/backup"
      bodyClass="page-backup"
      classicStyles={["/css/backup.css?v=database-header-search-clean-v1"]}
    >
      <BackupClient
        initialTables={Array.isArray(backupPayload?.tables) ? backupPayload.tables : []}
      />
    </AppShell>
  );
}
