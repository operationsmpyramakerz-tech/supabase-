import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import LmsUsersCenterClient from "../../../components/lms/LmsUsersCenterClient";
import { fetchLegacyJson } from "../../../lib/legacy-api";

export const dynamic = "force-dynamic";

const ROLE_KEYS = [
  "supervisors",
  "team-leaders",
  "instructors",
  "co-instructors",
  "school-coordinators",
  "students",
  "parents",
];

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

export default async function LmsUsersCenterPage({ searchParams }) {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=lms-users-center", { timeoutMs: 45000 });

  if (response.status === 401) redirect("/login?next=/next/lms/users-center");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>LMS Users Center is not available</h1>
          <p>Your LMS access profile does not include Users Center.</p>
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
          <h1>The new LMS Users Center could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/lms/user-access">Open classic Users Center</a>
            <a className="secondary-button" href="/next/lms">Return to LMS</a>
          </div>
        </section>
      </main>
    );
  }

  const params = await Promise.resolve(searchParams || {});
  const requestedTab = String(params?.tab || "").trim().toLowerCase();
  const initialTab = requestedTab === "structures" || ROLE_KEYS.includes(requestedTab) ? requestedTab : "structures";

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account");
  if (!account) redirect("/login?next=/next/lms/users-center");

  const rolePayloads = {};
  for (const role of ROLE_KEYS) {
    rolePayloads[role] = getResource(resources, `/api/lms/users-center/roles/${role}`, {
      ok: true,
      role,
      items: [],
    });
  }

  return (
    <AppShell
      account={account}
      title="LMS Users Center"
      eyebrow="Learning teams and structures"
      activePath="/next/lms/users-center"
      classicHrefOverride="/lms/user-access"
      lmsAccess={getResource(resources, "/api/lms/session-access", { ok: true, pages: [] })}
    >
      <LmsUsersCenterClient
        initialStructures={getResource(resources, "/api/lms/structures", { ok: true, structures: [] })}
        initialSchools={getResource(resources, "/api/lms/structures/schools", { ok: true, schools: [] })}
        initialRoles={rolePayloads}
        initialTab={initialTab}
        access={getResource(resources, "/api/lms/session-access", { ok: true, pages: [] })}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
