import { redirect } from "next/navigation";
import AppShell from "../../../../components/AppShell";
import LmsSchoolWorkspaceClient from "../../../../components/lms/LmsSchoolWorkspaceClient";
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

export default async function LmsSchoolWorkspacePage({ params }) {
  const resolvedParams = await Promise.resolve(params);
  const schoolId = String(resolvedParams?.id || "").trim();
  if (!schoolId) redirect("/lms/schools");

  const response = await fetchLegacyJson(`/api/page-bootstrap?scope=lms-school&id=${encodeURIComponent(schoolId)}`, { timeoutMs: 55000 });

  if (response.status === 401) redirect(`/login?next=/next/lms/schools/${encodeURIComponent(schoolId)}`);
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>This school workspace is not available</h1>
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
          <h1>The school workspace could not load</h1>
          <p>{response.error || response.data?.error || "The ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href={`/lms/b2b/school/${encodeURIComponent(schoolId)}`}>Open classic workspace</a>
            <a className="secondary-button" href="/next/lms/schools">Return to Schools</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account");
  if (!account) redirect(`/login?next=/next/lms/schools/${encodeURIComponent(schoolId)}`);
  const access = getResource(resources, "/api/lms/session-access", { ok: true, pages: [] });
  const school = getResource(resources, `/api/b2b/schools/${encodeURIComponent(schoolId)}`);
  const stock = getResource(resources, `/api/b2b/schools/${encodeURIComponent(schoolId)}/stock`, { meta: {}, items: [] });

  if (!school) {
    return (
      <AppShell account={account} title="LMS School" eyebrow="School operations" activePath={`/next/lms/schools/${schoolId}`} classicHrefOverride={`/lms/b2b/school/${encodeURIComponent(schoolId)}`} lmsAccess={access}>
        <main className="standalone-state">
          <section className="state-card">
            <span className="status-dot warning" />
            <h1>School not found</h1>
            <p>The requested school record is no longer available or could not be loaded.</p>
            <div className="actions"><a className="primary-button" href="/next/lms/schools">Return to Schools</a></div>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell
      account={account}
      title={school?.name || school?.fields?.school_name || "LMS School"}
      eyebrow="School operations and stocktaking"
      activePath={`/next/lms/schools/${schoolId}`}
      classicHrefOverride={`/lms/b2b/school/${encodeURIComponent(schoolId)}`}
      lmsAccess={access}
    >
      <LmsSchoolWorkspaceClient
        schoolId={schoolId}
        initialSchool={school}
        initialStock={stock}
        access={access}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
