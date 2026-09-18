import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import B2cFormsClient from "../../../components/b2c/B2cFormsClient";
import { loadDirectB2cFormsPageData } from "../../../lib/b2c-data";
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
    if (url === prefix || url.startsWith(`${prefix}?`)) return body;
  }
  return fallback;
}

export default async function B2cFormsPage({ searchParams }) {
  const resolvedSearch = await Promise.resolve(searchParams);
  const requestedFormId = String(resolvedSearch?.form || "").trim();
  const requestedDatabaseId = String(resolvedSearch?.database || "").trim();
  let pageData = await loadDirectB2cFormsPageData({ formId: requestedFormId }).catch(() => null);

  const loginNext = `/next/b2c/forms${requestedFormId ? `?form=${encodeURIComponent(requestedFormId)}` : ""}`;
  if (pageData?.status === 401) redirect(`/login?next=${encodeURIComponent(loginNext)}`);
  if (pageData?.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>B2C Forms are not available</h1>
          <p>Your account does not have access to Customer Form or Customer Database.</p>
          <div className="actions">
            <a className="primary-button" href="/next/home">Return to Home</a>
            <a className="secondary-button" href="/next/b2c/forms">Refresh</a>
          </div>
        </section>
      </main>
    );
  }

  if (!pageData?.ok) {
    const query = new URLSearchParams({ scope: "b2c-forms" });
    if (requestedFormId) query.set("form", requestedFormId);
    if (requestedDatabaseId) query.set("database", requestedDatabaseId);
    const response = await fetchLegacyJson(`/api/page-bootstrap?${query.toString()}`, { timeoutMs: 50000 });

    if (response.status === 401) redirect(`/login?next=${encodeURIComponent(loginNext)}`);
    if (response.status === 403) {
      return (
        <main className="standalone-state">
          <section className="state-card">
            <span className="status-dot warning" />
            <h1>B2C Forms are not available</h1>
            <p>Your account does not have access to Customer Form or Customer Database.</p>
            <div className="actions">
              <a className="primary-button" href="/next/home">Return to Home</a>
              <a className="secondary-button" href="/next/b2c/forms">Refresh</a>
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
            <h1>The new B2C Forms page could not load</h1>
            <p>{response.error || response.data?.error || pageData?.error || "The ERP API is temporarily unavailable."}</p>
            <div className="actions">
              <a className="primary-button" href="/next/b2c/forms">Try again</a>
              <a className="secondary-button" href="/next/home">Return to Home</a>
            </div>
          </section>
        </main>
      );
    }

    const resources = resourceMap(response.data);
    const account = getResource(resources, "/api/account", null);
    if (!account) redirect(`/login?next=${encodeURIComponent("/next/b2c/forms")}`);
    pageData = {
      ok: true,
      account,
      payload: getResource(resources, "/api/b2c/forms", { forms: [], databases: [] }),
      selected: requestedFormId ? getResource(resources, `/api/b2c/forms/${encodeURIComponent(requestedFormId)}`, null) : null,
      warnings: response.data.omitted || [],
      source: "legacy-bootstrap",
    };
  }

  return (
    <AppShell
      account={pageData.account}
      title="Forms"
      eyebrow="B2C customer entry"
      activePath="/next/b2c/forms"
      bodyClass="b2c-page b2c-form-page"
      pageStyles={["/next/css/b2c.css?v=b2c-form-builder-controls-v1"]}
    >
      <B2cFormsClient
        account={pageData.account}
        initialPayload={pageData.payload || { forms: [], databases: [] }}
        initialSelectedPayload={pageData.selected || null}
        initialFormId={requestedFormId}
        initialDatabaseId={requestedDatabaseId}
        bootstrapWarnings={pageData.warnings || []}
      />
    </AppShell>
  );
}
