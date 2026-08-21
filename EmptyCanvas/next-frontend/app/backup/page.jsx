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
      classicStyles={["/css/backup.css?v=database-page-folders-v1"]}
    >
      <style>{`
        .page-backup .backup-page-folder-card .backup-folder-paper {
          top: auto !important;
          bottom: 6px !important;
          width: 38px !important;
          height: 27px !important;
          border-radius: 8px 8px 6px 6px !important;
          border: 1px solid rgba(120, 53, 15, .18) !important;
          background: linear-gradient(180deg, #fff8e6 0%, #fde68a 58%, #f59e0b 100%) !important;
          box-shadow: 0 9px 18px rgba(15, 23, 42, .18) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper::before {
          content: "" !important;
          position: absolute !important;
          left: 4px !important;
          right: auto !important;
          top: -7px !important;
          width: 16px !important;
          height: 8px !important;
          border-radius: 6px 6px 0 0 !important;
          border: 1px solid rgba(120, 53, 15, .16) !important;
          border-bottom: 0 !important;
          background: linear-gradient(180deg, #fff8e6 0%, #fcd46a 100%) !important;
          box-shadow: none !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper::after {
          content: "" !important;
          position: absolute !important;
          left: 7px !important;
          right: 7px !important;
          top: 8px !important;
          height: 3px !important;
          border-radius: 999px !important;
          background: rgba(255, 255, 255, .52) !important;
          box-shadow: 0 7px 0 rgba(217, 119, 6, .18) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--left {
          left: 7px !important;
          transform: rotate(-8deg) translateY(3px) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--middle {
          left: 40px !important;
          top: auto !important;
          bottom: 11px !important;
          z-index: 2 !important;
          transform: none !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--right {
          right: 7px !important;
          transform: rotate(8deg) translateY(4px) !important;
        }
      `}</style>
      <BackupClient
        initialTables={Array.isArray(backupPayload?.tables) ? backupPayload.tables : []}
      />
    </AppShell>
  );
}
