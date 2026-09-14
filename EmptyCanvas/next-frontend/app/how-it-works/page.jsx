import AppShell from "../../components/AppShell";
import HowItWorksClient from "../../components/how-it-works/HowItWorksClient";
import { getLegacyAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

export default async function HowItWorksPage() {
  const gate = await getLegacyAccountGate([]);

  if (gate.status === 401) {
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

  if (!gate.ok || !gate.account) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new How it works page could not load</h1>
          <p>{gate.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/next/how-it-works">Try again</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell
      account={gate.account}
      title="How it works"
      eyebrow="Operations SOP and workflow guide"
      activePath="/next/how-it-works"
    >
      <HowItWorksClient account={gate.account} />
    </AppShell>
  );
}
