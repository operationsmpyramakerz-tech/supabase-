import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import BackupTableClient from "../../../components/backup/BackupTableClient";
import { findBackupTable, loadBackupTableRows } from "../../../lib/backup-data";
import { getLegacyAccountGate } from "../../../lib/products-auth";

export const dynamic = "force-dynamic";

export default async function BackupTablePage({ params, searchParams }) {
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const tableKey = String(resolvedParams?.key || "").trim();
  if (!tableKey) redirect("/next/backup");

  const rawBackFolder = String(resolvedSearchParams?.folder || "").trim();
  const backFolder = /^[a-z0-9-]+$/i.test(rawBackFolder) ? rawBackFolder : "";
  const gate = await getLegacyAccountGate(["Backup"]);

  if (!gate.ok && gate.status === 401) redirect(`/login?next=/next/backup/${encodeURIComponent(tableKey)}`);
  if (!gate.ok && gate.status === 403) {
    return (
      <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>Database is not available</h1><p>Your account does not have access to the Database module.</p><a className="primary-button" href="/next/home">Return to Home</a></section></main>
    );
  }
  if (!gate.ok || !gate.account) {
    return (
      <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>The database table could not load</h1><p>{gate.error || "The current ERP authentication service is temporarily unavailable."}</p><div className="actions"><a className="primary-button" href="/next/backup">Return to Database</a><a className="secondary-button" href="/next/home">Return to Home</a></div></section></main>
    );
  }

  const initialTable = findBackupTable(tableKey);
  if (!initialTable) redirect("/next/backup");

  let initialPayload = null;
  try {
    initialPayload = await loadBackupTableRows(tableKey, { limit: 50, offset: 0, account: gate.account });
  } catch (error) {
    console.warn("[backup] server preload for table rows failed; client fallback will retry:", error?.message || error);
  }

  return (
    <AppShell
      account={gate.account}
      title={initialTable.pageName || "Database Table"}
      eyebrow="Database table"
      activePath="/next/backup"
      bodyClass="page-backup page-backup-table"
      pageStyles={["/next/css/backup.css?v=database-page-folders-v1"]}
    >
      <BackupTableClient
        tableKey={tableKey}
        initialTable={initialTable}
        initialPayload={initialPayload}
        backFolder={backFolder}
      />
    </AppShell>
  );
}
