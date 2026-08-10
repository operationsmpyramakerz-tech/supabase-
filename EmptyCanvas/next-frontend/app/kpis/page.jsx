import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import KpisClient from "../../components/kpis/KpisClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

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

export default async function KpisPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=kpis", { timeoutMs: 40000 });

  if (response.status === 401) redirect("/login?next=/next/kpis");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>KPIs is not available</h1>
          <p>Your account does not have access to the KPI performance module.</p>
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
          <h1>The new KPIs page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/kpis?classic=1">Open classic KPIs</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const meta = getResource(resources, "/api/kpis/meta", { ok: true, users: [], standards: [], departments: [], positions: [], positionsByDepartment: {}, currentUser: null, accessLevel: "view" });
  const reviews = getResource(resources, "/api/kpis/reviews", { ok: true, reviews: [] });
  const graph = getResource(resources, "/api/kpis/graph", { ok: true, points: [] });

  if (!account) redirect("/login?next=/next/kpis");

  return (
    <AppShell
      account={account}
      title="KPIs"
      eyebrow="Employee performance management"
      activePath="/next/kpis"
      bodyClass="kpis-page"
      classicStyles={["/css/kpis.css?v=next-stage-2l-kpis"]}
    >
      <KpisClient
        initialMeta={meta}
        initialReviews={reviews}
        initialGraph={graph}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
