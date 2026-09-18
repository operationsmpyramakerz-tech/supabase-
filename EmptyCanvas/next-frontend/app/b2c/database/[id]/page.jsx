import { redirect } from "next/navigation";
import AppShell from "../../../../components/AppShell";
import B2cTableWorkspaceClient from "../../../../components/b2c/B2cTableWorkspaceClient";
import { loadDirectB2cTablePageData } from "../../../../lib/b2c-data";
import { fetchLegacyJson } from "../../../../lib/legacy-api";

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
    if (url === prefix || url.startsWith(`${prefix}?`)) return body;
  }
  return fallback;
}

export default async function B2cTableWorkspacePage({ params }) {
  const resolvedParams = await Promise.resolve(params);
  const databaseId = String(resolvedParams?.id || "").trim();
  if (!databaseId) redirect("/b2c/database");

  const encodedId = encodeURIComponent(databaseId);
  let pageData = await loadDirectB2cTablePageData(databaseId).catch(() => null);

  if (pageData?.status === 401) redirect(`/login?next=/next/b2c/database/${encodedId}`);
  if (pageData?.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>B2C Table Workspace is not available</h1>
          <p>Your account does not have access to Customer Database.</p>
          <div className="actions">
            <a className="primary-button" href="/next/b2c/database">Return to B2C Database</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  if (!pageData?.ok) {
    const response = await fetchLegacyJson(`/api/page-bootstrap?scope=b2c-table&id=${encodedId}`, { timeoutMs: 55000 });
    if (response.status === 401) redirect(`/login?next=/next/b2c/database/${encodedId}`);
    if (response.status === 403) {
      return (
        <main className="standalone-state">
          <section className="state-card">
            <span className="status-dot warning" />
            <h1>B2C Table Workspace is not available</h1>
            <p>Your account does not have access to Customer Database.</p>
            <div className="actions">
              <a className="primary-button" href="/next/b2c/database">Return to B2C Database</a>
              <a className="secondary-button" href="/next/home">Return to Home</a>
            </div>
          </section>
        </main>
      );
    }
    if (!response.ok || !response.data?.ok) {
      return (
        <main className="standalone-state">
          <section className="state-card">
            <span className="status-dot warning" />
            <h1>The B2C table workspace could not load</h1>
            <p>{response.error || response.data?.error || pageData?.error || "The ERP API is temporarily unavailable."}</p>
            <div className="actions">
              <a className="primary-button" href={`/next/b2c/database/${encodedId}`}>Try again</a>
              <a className="secondary-button" href="/next/b2c/database">Return to Databases</a>
            </div>
          </section>
        </main>
      );
    }
    const resources = resourceMap(response.data);
    const account = getResource(resources, "/api/account");
    const bundlePath = `/api/b2c/databases/${encodedId}/records`;
    const payload = getResource(resources, bundlePath, null);
    if (!account) redirect(`/login?next=/next/b2c/database/${encodedId}`);
    pageData = {
      ok: true,
      account,
      payload,
      warnings: response.data.omitted || [],
      source: "legacy-bootstrap",
    };
  }

  const tablePayload = pageData.payload;
  if (!tablePayload?.database) {
    return (
      <AppShell
        account={pageData.account}
        title="B2C Table"
        eyebrow="Customer data workspace"
        activePath={`/next/b2c/database/${databaseId}`}
        bodyClass="b2c-page b2c-table-view-page"
        pageStyles={["/next/css/b2c.css?v=b2c-formula-calculator-v2"]}
      >
        <main className="standalone-state">
          <section className="state-card">
            <span className="status-dot warning" />
            <h1>Table not found</h1>
            <p>The requested B2C database is no longer available or could not be loaded.</p>
            <div className="actions"><a className="primary-button" href="/next/b2c/database">Return to Databases</a></div>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell
      account={pageData.account}
      title="Database"
      eyebrow="B2C customer data"
      activePath={`/next/b2c/database/${databaseId}`}
      bodyClass="b2c-page b2c-table-view-page"
      pageStyles={["/next/css/b2c.css?v=b2c-formula-calculator-v2"]}
    >
      <B2cTableWorkspaceClient
        databaseId={databaseId}
        initialPayload={tablePayload}
        bootstrapWarnings={pageData.warnings || []}
      />
    </AppShell>
  );
}
