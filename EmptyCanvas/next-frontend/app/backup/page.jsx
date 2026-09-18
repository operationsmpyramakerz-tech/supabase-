import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import BackupClient from "../../components/backup/BackupClient";
import { backupCatalog } from "../../lib/backup-data";
import { getLegacyAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const gate = await getLegacyAccountGate(["Backup"]);

  if (!gate.ok && gate.status === 401) redirect("/login?next=/next/backup");
  if (!gate.ok && gate.status === 403) {
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

  if (!gate.ok || !gate.account) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new Database Backup page could not load</h1>
          <p>{gate.error || "The current ERP authentication service is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/next/backup">Try again</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell
      account={gate.account}
      title="Database"
      eyebrow="Backup, restore and database control"
      activePath="/next/backup"
      bodyClass="page-backup"
      pageStyles={["/next/css/backup.css?v=database-original-folders-v1"]}
    >
      <BackupClient initialTables={backupCatalog()} />
    </AppShell>
  );
}
