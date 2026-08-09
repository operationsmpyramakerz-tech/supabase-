import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import AccountClient from "../../components/account/AccountClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const response = await fetchLegacyJson("/api/account", { timeoutMs: 15000 });

  if (response.status === 401) redirect("/login?next=/next/account");

  if (!response.ok || !response.data) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new Account page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/account?classic=1">Open classic Account</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell
      account={response.data}
      title="My Account"
      eyebrow="Profile, security and personal workspace"
      activePath="/next/account"
      classicHrefOverride="/account"
    >
      <AccountClient initialAccount={response.data} />
    </AppShell>
  );
}
