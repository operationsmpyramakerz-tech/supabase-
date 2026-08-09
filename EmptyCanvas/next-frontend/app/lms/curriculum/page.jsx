import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import LmsCurriculumClient from "../../../components/lms/LmsCurriculumClient";
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

export default async function LmsCurriculumPage({ searchParams }) {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=lms-curriculum", { timeoutMs: 45000 });

  if (response.status === 401) redirect("/login?next=/next/lms/curriculum");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>LMS Curriculum is not available</h1>
          <p>Your LMS access profile does not include the Curriculum workspace.</p>
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
          <h1>The new LMS Curriculum page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/lms/curriculum?classic=1">Open classic Curriculum</a>
            <a className="secondary-button" href="/next/lms">Return to LMS</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account");
  if (!account) redirect("/login?next=/next/lms/curriculum");
  const access = getResource(resources, "/api/lms/session-access", { ok: true, pages: [] });
  const initialCatalog = getResource(resources, "/api/lms/curriculum", { ok: true, groups: [], curricula: [] });
  const params = await Promise.resolve(searchParams || {});

  return (
    <AppShell
      account={account}
      title="LMS Curriculum"
      eyebrow="Themes, grades, and protected learning resources"
      activePath="/next/lms/curriculum"
      classicHrefOverride="/lms/curriculum"
      lmsAccess={access}
    >
      <LmsCurriculumClient
        initialCatalog={initialCatalog}
        access={access}
        initialThemeId={String(params?.theme || "")}
        initialGradeId={String(params?.grade || "")}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
