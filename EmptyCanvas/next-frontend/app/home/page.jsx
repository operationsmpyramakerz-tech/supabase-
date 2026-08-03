import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

function permissionCount(account) {
  if (Array.isArray(account?.pageAccess?.pages)) {
    return account.pageAccess.pages.filter((page) => page?.access && page.access !== "None").length;
  }
  return Array.isArray(account?.allowedPages) ? account.allowedPages.length : 0;
}

export default async function HomePage() {
  const accountResponse = await fetchLegacyJson("/api/account", { timeoutMs: 9000 });

  if (accountResponse.status === 401 || accountResponse.status === 403) {
    redirect("/login?next=/next/home");
  }

  if (!accountResponse.ok || !accountResponse.data) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The pilot could not load your account</h1>
          <p>{accountResponse.error || accountResponse.data?.error || "The current Node.js API is temporarily unavailable."}</p>
          <a className="primary-button" href="/home">Open the current interface</a>
        </section>
      </main>
    );
  }

  const account = accountResponse.data;
  const pages = permissionCount(account);

  return (
    <AppShell account={account}>
      <section className="content-grid">
        <article className="hero-card">
          <div>
            <span className="pill">Server-rendered</span>
            <h2>Welcome, {account.name || account.username || "User"}</h2>
            <p>This page is rendered by Next.js while authentication, permissions, data, uploads, and business logic continue to use the existing Node.js backend.</p>
          </div>
          <div className="hero-metric">
            <strong>{pages}</strong>
            <span>accessible pages</span>
          </div>
        </article>

        <article className="info-card">
          <span className="card-label">Department</span>
          <strong>{account.department || "Not specified"}</strong>
          <p>{account.position || "Position not specified"}</p>
        </article>

        <article className="info-card">
          <span className="card-label">Migration mode</span>
          <strong>Side by side</strong>
          <p>The existing ERP remains the production fallback while pages are moved individually.</p>
        </article>

        <article className="wide-card">
          <div>
            <span className="card-label">Safe rollout</span>
            <h3>No full rewrite is required</h3>
            <p>Every migrated page can call the same protected APIs and reuse the same Redis session cookie. Legacy links stay available until the replacement page is approved.</p>
          </div>
          <div className="actions">
            <a className="primary-button" href="/home">Current Home</a>
            <a className="secondary-button" href="/next/migration-status">View migration status</a>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
