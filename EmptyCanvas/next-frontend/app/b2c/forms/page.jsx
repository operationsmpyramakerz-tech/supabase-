import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import B2cFormsClient from "../../../components/b2c/B2cFormsClient";
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
  const query = new URLSearchParams({ scope: "b2c-forms" });
  if (requestedFormId) query.set("form", requestedFormId);
  if (requestedDatabaseId) query.set("database", requestedDatabaseId);

  const response = await fetchLegacyJson(`/api/page-bootstrap?${query.toString()}`, { timeoutMs: 50000 });

  if (response.status === 401) redirect(`/login?next=${encodeURIComponent(`/next/b2c/forms${requestedFormId ? `?form=${requestedFormId}` : ""}`)}`);
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>B2C Forms are not available</h1>
          <p>Your account does not have access to Customer Form or Customer Database.</p>
          <div className="actions">
            <a className="primary-button" href="/next/home">Return to Home</a>
            <a className="secondary-button" href="/b2c/form">Open classic Forms</a>
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
          <p>{response.error || response.data?.error || "The ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/b2c/form">Open classic Forms</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const formsPayload = getResource(resources, "/api/b2c/forms", { forms: [], databases: [] });
  const selectedPayload = requestedFormId
    ? getResource(resources, `/api/b2c/forms/${encodeURIComponent(requestedFormId)}`, null)
    : null;

  if (!account) redirect(`/login?next=${encodeURIComponent("/next/b2c/forms")}`);

  return (
    <AppShell
      account={account}
      title="B2C Forms"
      eyebrow="Customer entry and form builder"
      activePath="/next/b2c/forms"
      classicHrefOverride="/b2c/form"
    >
      <B2cFormsClient
        account={account}
        initialPayload={formsPayload}
        initialSelectedPayload={selectedPayload}
        initialFormId={requestedFormId}
        initialDatabaseId={requestedDatabaseId}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
