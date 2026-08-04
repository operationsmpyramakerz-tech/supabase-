import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import LmsHomeClient from "../../components/lms/LmsHomeClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

function resourceMap(bundle) {
  const map = new Map();
  for (const resource of Array.isArray(bundle?.resources) ? bundle.resources : []) {
    map.set(resource.url, resource.body);
  }
  return map;
}

function getResource(map, url, fallback = null) {
  if (map.has(url)) return map.get(url);
  for (const [key, body] of map.entries()) {
    if (key === url || key.startsWith(`${url}?`)) return body;
  }
  return fallback;
}

export default async function LmsHomePage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=lms-home", { timeoutMs: 30000 });
  if (response.status === 401 || response.status === 403) redirect("/login?next=/next/lms");

  if (!response.ok || !response.data?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The LMS overview could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <a className="primary-button" href="/lms">Open classic LMS</a>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account");
  if (!account) redirect("/login?next=/next/lms");

  const overview = getResource(resources, "/api/lms/home/overview", {
    ok: true,
    counts: {},
    roles: {},
    resourceTypes: {},
    recentCurricula: [],
  });
  const access = getResource(resources, "/api/lms/session-access", {
    ok: true,
    pages: [],
    summary: { accessCount: 0, adminCount: 0 },
  });

  return (
    <AppShell account={account} title="LMS" eyebrow="Learning management overview" activePath="/next/lms">
      <LmsHomeClient
        initialOverview={overview}
        access={access}
        omitted={response.data.omitted || []}
      />
    </AppShell>
  );
}
