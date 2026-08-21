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
      classicStyles={["/css/backup.css?v=database-page-folder-stack-v2"]}
    >
      <style>{`
        /* Main database folders contain table folders: one front folder + two stacked behind it. */
        .page-backup .backup-page-folder-card .backup-folder-figure {
          top: 8px !important;
          width: 116px !important;
          height: 58px !important;
          z-index: 6 !important;
          overflow: visible !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper {
          position: absolute !important;
          bottom: auto !important;
          width: 58px !important;
          height: 34px !important;
          border-radius: 10px 10px 8px 8px !important;
          border: 1px solid rgba(15, 23, 42, .12) !important;
          box-shadow: 0 10px 18px rgba(15, 23, 42, .24), inset 0 1px 0 rgba(255,255,255,.34) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper::before {
          content: "" !important;
          position: absolute !important;
          left: 5px !important;
          right: auto !important;
          top: -8px !important;
          width: 22px !important;
          height: 10px !important;
          border-radius: 7px 7px 1px 1px !important;
          border: 1px solid rgba(15, 23, 42, .10) !important;
          border-bottom: 0 !important;
          box-shadow: none !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper::after {
          content: "" !important;
          position: absolute !important;
          left: 8px !important;
          right: 8px !important;
          top: 10px !important;
          height: 3px !important;
          border-radius: 999px !important;
          background: rgba(255,255,255,.30) !important;
          box-shadow: 0 7px 0 rgba(255,255,255,.13) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--left {
          left: 2px !important;
          top: 17px !important;
          z-index: 1 !important;
          transform: rotate(-8deg) scale(.90) !important;
          background: linear-gradient(180deg, #8b3338 0%, #76272d 100%) !important;
          opacity: .92 !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--left::before {
          background: linear-gradient(180deg, #a34449 0%, #8b3338 100%) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--right {
          right: 2px !important;
          left: auto !important;
          top: 17px !important;
          z-index: 2 !important;
          transform: rotate(8deg) scale(.90) !important;
          background: linear-gradient(180deg, #656b73 0%, #4f555d 100%) !important;
          opacity: .94 !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--right::before {
          background: linear-gradient(180deg, #777d85 0%, #656b73 100%) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--middle {
          left: 50% !important;
          top: 10px !important;
          z-index: 4 !important;
          transform: translateX(-50%) !important;
          background: linear-gradient(180deg, #ffffff 0%, #f5f5f4 50%, #e7e5e4 100%) !important;
          border-color: rgba(15, 23, 42, .10) !important;
          box-shadow: 0 13px 22px rgba(15, 23, 42, .28), inset 0 1px 0 rgba(255,255,255,.90) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-paper--middle::before {
          background: linear-gradient(180deg, #ffffff 0%, #eeeeec 100%) !important;
          border-color: rgba(15, 23, 42, .08) !important;
        }
        .page-backup .backup-page-folder-card .backup-folder-back,
        .page-backup .backup-page-folder-card .backup-folder-front {
          display: none !important;
        }
      `}</style>
      <BackupClient
        initialTables={Array.isArray(backupPayload?.tables) ? backupPayload.tables : []}
      />
    </AppShell>
  );
}
