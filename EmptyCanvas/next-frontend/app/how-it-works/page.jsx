import AppShell from "../../components/AppShell";
import HowItWorksClient from "../../components/how-it-works/HowItWorksClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

export default async function HowItWorksPage() {
  const response = await fetchLegacyJson("/api/account", { timeoutMs: 15000 });

  if (response.status === 401) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Sign in to open the operations guide</h1>
          <p>Your ERP session is not active.</p>
          <a className="primary-button" href="/login?next=/next/how-it-works">Open sign in</a>
        </section>
      </main>
    );
  }

  if (!response.ok || !response.data) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new How it works page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/how-it-works">Open classic guide</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell
      account={response.data}
      title="How it works"
      eyebrow="Operations SOP and workflow guide"
      activePath="/next/how-it-works"
      classicHrefOverride="/how-it-works"
    >
      <HowItWorksClient account={response.data} />
    </AppShell>
  );
}
