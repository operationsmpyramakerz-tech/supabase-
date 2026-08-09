import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import AppInstallClient from "../../components/app-install/AppInstallClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

export default async function AppInstallPage() {
  const [accountResponse, linksResponse] = await Promise.all([
    fetchLegacyJson("/api/account", { timeoutMs: 15000 }),
    fetchLegacyJson("/api/app-download-links", { timeoutMs: 10000 }),
  ]);

  if (accountResponse.status === 401) redirect("/login?next=/next/app-install");

  if (!accountResponse.ok || !accountResponse.data) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The App Install center could not load</h1>
          <p>{accountResponse.error || accountResponse.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/pwa-start?classic=1">Open classic app launcher</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell
      account={accountResponse.data}
      title="Install Operations Hub"
      eyebrow="Progressive Web App and device installation"
      activePath="/next/app-install"
      classicHrefOverride="/pwa-start?classic=1"
    >
      <AppInstallClient initialLinks={linksResponse.ok ? (linksResponse.data || {}) : {}} />
    </AppShell>
  );
}
