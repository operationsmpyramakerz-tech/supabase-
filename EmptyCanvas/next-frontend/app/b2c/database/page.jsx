import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import B2cDatabaseClient from "../../../components/b2c/B2cDatabaseClient";
import { fetchLegacyJson } from "../../../lib/legacy-api";

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

export default async function B2cDatabasePage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=b2c-database", { timeoutMs: 45000 });

  if (response.status === 401) redirect("/login?next=/next/b2c/database");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>B2C Database is not available</h1>
          <p>Your account does not have access to Customer Database.</p>
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
          <h1>The new B2C Database page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/b2c/database?classic=1">Open classic Database</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const databasePayload = getResource(resources, "/api/b2c/databases", { ok: true, databases: [] });

  if (!account) redirect("/login?next=/next/b2c/database");

  return (
    <AppShell
      account={account}
      title="Database"
      eyebrow="B2C customer data"
      activePath="/next/b2c/database"
      classicHrefOverride="/b2c/database"
      bodyClass="b2c-page b2c-database-page b2c-library-page"
      classicStyles={["/css/b2c.css?v=b2c-formula-calculator-v2"]}
    >
      <B2cDatabaseClient
        account={account}
        initialPayload={databasePayload}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
