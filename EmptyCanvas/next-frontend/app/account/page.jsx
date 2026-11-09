import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import AccountClient from "../../components/account/AccountClient";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import { accountWithOwnFilesMedia } from "../../lib/account-direct";
import { getDirectAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const gate = await getDirectAccountGate([]);

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

  if (!featureAllowed(gate.account, "account.view")) {
    return <main className="standalone-state"><section className="state-card"><h1>Profile access denied</h1><p>You do not have permission to view your profile.</p><a className="secondary-button" href="/next/home">Return to Home</a></section></main>;
  }

  let displayAccount;
  try {
    displayAccount = await accountWithOwnFilesMedia(gate.account);
  } catch (error) {
    console.error("[account] Unable to load own files and media:", error?.message || error);
    displayAccount = { ...gate.account, filesMedia: [], filesMediaLoadError: true };
  }

  return (
    <AppShell
      account={displayAccount}
      title="User Profile"
      eyebrow="Profile, security and personal workspace"
      activePath="/next/account"
      bodyClass="page-account"
      pageStyles={["/next/css/account-classic-inline.css?v=profile-edit-20261016", "/next/css/notification-preferences.css?v=1"]}
    >
      <AccountClient initialAccount={displayAccount} />
    </AppShell>
  );
}
