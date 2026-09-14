import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import AppInstallClient from "../../components/app-install/AppInstallClient";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { getLegacyAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

export default async function AppInstallPage() {
  const [gate, linksResponse] = await Promise.all([
    getLegacyAccountGate([]),
    fetchLegacyJson("/api/app-download-links", { timeoutMs: 10000 }),
  ]);

  if (gate.status === 401) redirect("/login?next=/next/app-install");

  if (!gate.ok || !gate.account) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The App Install center could not load</h1>
          <p>{gate.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/next/app-install">Try again</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell
      account={gate.account}
      title="Install Operations Hub"
      eyebrow="Progressive Web App and device installation"
      activePath="/next/app-install"
    >
      <AppInstallClient initialLinks={linksResponse.ok ? (linksResponse.data || {}) : {}} />
    </AppShell>
  );
}
