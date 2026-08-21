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
        /* Main database folders contain folders, so show three mini-folder icons. */
        .page-backup .backup-page-folder-card .backup-folder-figure {
          top: 10px !important;
          width: 120px !important;
          height: 62px !important;
          z-index: 6 !important;
          overflow: visible !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper {
          top: 15px !important;
          bottom: auto !important;
          width: 38px !important;
          height: 29px !important;
          z-index: 2 !important;
          border-radius: 8px 8px 7px 7px !important;
          border: 1px solid rgba(120, 53, 15, .16) !important;
          background: linear-gradient(180deg, #fffdf6 0%, #fff2bf 46%, #f9c84d 100%) !important;
          box-shadow: 0 8px 16px rgba(15, 23, 42, .24), inset 0 1px 0 rgba(255,255,255,.9) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper::before {
          content: "" !important;
          position: absolute !important;
          left: 4px !important;
          right: auto !important;
          top: -8px !important;
          width: 17px !important;
          height: 10px !important;
          border-radius: 6px 6px 1px 1px !important;
          border: 1px solid rgba(120, 53, 15, .14) !important;
          border-bottom: 0 !important;
          background: linear-gradient(180deg, #fffdf7 0%, #ffe7a0 100%) !important;
          box-shadow: none !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper::after {
          content: "" !important;
          position: absolute !important;
          left: 7px !important;
          right: 7px !important;
          top: 9px !important;
          height: 3px !important;
          border-radius: 999px !important;
          background: rgba(255,255,255,.68) !important;
          box-shadow: 0 7px 0 rgba(180, 83, 9, .14) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--left {
          left: 5px !important;
          transform: rotate(-7deg) translateY(4px) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--middle {
          left: 41px !important;
          top: 9px !important;
          bottom: auto !important;
          z-index: 4 !important;
          transform: none !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--right {
          right: 5px !important;
          left: auto !important;
          transform: rotate(7deg) translateY(4px) !important;
        }
      `}</style>
      <BackupClient
        initialTables={Array.isArray(backupPayload?.tables) ? backupPayload.tables : []}
      />
    </AppShell>
  );
}
