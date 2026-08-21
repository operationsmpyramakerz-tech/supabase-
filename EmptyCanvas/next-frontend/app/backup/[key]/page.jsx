import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import BackupTableClient from "../../../components/backup/BackupTableClient";
import { fetchLegacyJson } from "../../../lib/legacy-api";

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

export default async function BackupTablePage({ params, searchParams }) {
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const tableKey = String(resolvedParams?.key || "").trim();
  if (!tableKey) redirect("/next/backup");
  const rawBackFolder = String(resolvedSearchParams?.folder || "").trim();
  const backFolder = /^[a-z0-9-]+$/i.test(rawBackFolder) ? rawBackFolder : "";

  const response = await fetchLegacyJson("/api/page-bootstrap?scope=backup", { timeoutMs: 30000 });
  if (response.status === 401) redirect(`/login?next=/next/backup/${encodeURIComponent(tableKey)}`);
  if (response.status === 403) {
    return (
      <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>Database is not available</h1><p>Your account does not have access to the Database module.</p><a className="primary-button" href="/next/home">Return to Home</a></section></main>
    );
  }
  if (!response.ok || !response.data?.ok) {
    return (
      <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>The database table could not load</h1><p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p><div className="actions"><a className="primary-button" href="/next/backup">Return to Database</a><a className="secondary-button" href="/next/home">Return to Home</a></div></section></main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const backupPayload = getResource(resources, "/api/backup/tables", { ok: true, tables: [] });
  if (!account) redirect(`/login?next=/next/backup/${encodeURIComponent(tableKey)}`);
  const initialTable = (Array.isArray(backupPayload?.tables) ? backupPayload.tables : []).find((item) => String(item?.key || "") === tableKey) || null;
  if (!initialTable) redirect("/next/backup");

  return (
    <AppShell
      account={account}
      title={initialTable.pageName || "Database Table"}
      eyebrow="Database table"
      activePath="/next/backup"
      classicHrefOverride="/backup"
      bodyClass="page-backup page-backup-table"
      classicStyles={["/css/backup.css?v=database-page-folders-v1"]}
    >
      <BackupTableClient tableKey={tableKey} initialTable={initialTable} backFolder={backFolder} />
    </AppShell>
  );
}
