import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import LmsSchoolsClient from "../../../components/lms/LmsSchoolsClient";
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

export default async function LmsSchoolsPage({ searchParams }) {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=lms-schools", { timeoutMs: 45000 });

  if (response.status === 401) redirect("/login?next=/next/lms/schools");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>LMS Schools is not available</h1>
          <p>Your LMS access profile does not include the Schools workspace.</p>
          <div className="actions">
            <a className="primary-button" href="/next/lms">Return to LMS</a>
            <a className="secondary-button" href="/home">Return to Home</a>
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
          <h1>The new LMS Schools page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/lms/b2b">Open classic Schools</a>
            <a className="secondary-button" href="/next/lms">Return to LMS</a>
          </div>
        </section>
      </main>
    );
  }

  const params = await Promise.resolve(searchParams || {});
  const initialCreate = String(params?.action || "").trim().toLowerCase() === "new";
  const initialEditId = String(params?.edit || "").trim();

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account");
  if (!account) redirect("/login?next=/next/lms/schools");
  const access = getResource(resources, "/api/lms/session-access", { ok: true, pages: [] });

  return (
    <AppShell
      account={account}
      title="LMS Schools"
      eyebrow="School operations and contracts"
      activePath="/next/lms/schools"
      classicHrefOverride="/lms/b2b"
      lmsAccess={access}
    >
      <LmsSchoolsClient
        initialSchools={getResource(resources, "/api/b2b/schools", [])}
        initialStocktakingColumns={getResource(resources, "/api/b2b/stocktaking-columns", { ok: true, columns: [] })}
        initialCreate={initialCreate}
        initialEditId={initialEditId}
        access={access}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
