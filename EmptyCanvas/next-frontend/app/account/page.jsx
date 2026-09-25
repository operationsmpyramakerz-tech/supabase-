import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import AccountClient from "../../components/account/AccountClient";
import { getLegacyAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const gate = await getLegacyAccountGate([]);

  if (gate.status === 401) redirect("/login?next=/next/account");

  if (!gate.ok || !gate.account) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new Account page could not load</h1>
          <p>{gate.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/next/account">Try again</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell
      account={gate.account}
      title="User Profile"
      eyebrow="Profile, security and personal workspace"
      activePath="/next/account"
      bodyClass="page-account"
      pageStyles={["/next/css/account-classic-inline.css?v=next-stage-2u-profile-overlap"]}
    >
      <AccountClient initialAccount={gate.account} />
    </AppShell>
  );
}
