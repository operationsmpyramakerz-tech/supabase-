import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import UsersCenterClient from "../../components/users-center/UsersCenterClient";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { usersCenterDirectory, usersCenterSignupRequests } from "../../lib/users-center-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

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

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Users Center is not available" : "The new Users Center could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/next/users-center">Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}


async function legacySignupPayload() {
  const response = await fetchLegacyJson("/api/user-access/signup-requests?status=pending", { timeoutMs: 20000 });
  return response.ok && response.data ? response.data : null;
}

async function legacyUsersCenterBundle() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=users-center", { timeoutMs: 45000 });
  if (!response.ok || !response.data?.ok) return null;
  const resources = resourceMap(response.data);
  return {
    directory: getResource(resources, "/api/user-access/team-members", null),
    signup: getResource(resources, "/api/user-access/signup-requests", { ok: true, requests: [] }),
    warnings: response.data.omitted || [],
  };
}

export default async function UsersCenterPage() {
  const gate = await getLegacyAccountGate(ACCESS_PAGES);

  if (gate.status === 401) redirect("/login?next=/next/users-center");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to team members, departments, and page permissions." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The current ERP authentication service is temporarily unavailable."} />;
  }

  const warnings = [];
  const [directoryResult, signupResult] = await Promise.allSettled([
    usersCenterDirectory(),
    usersCenterSignupRequests({ status: "pending" }),
  ]);

  let directory = directoryResult.status === "fulfilled" ? directoryResult.value : null;
  let signup = signupResult.status === "fulfilled" ? signupResult.value : null;

  if (!signup) {
    signup = await legacySignupPayload();
    if (signup) warnings.push("Sign up request count loaded through the recovery path.");
    else signup = { ok: true, requests: [] };
  }

  if (!directory) {
    const legacy = await legacyUsersCenterBundle();
    if (!legacy?.directory) {
      return <UnavailableState message={directoryResult.reason?.message || "Users Center data is temporarily unavailable."} />;
    }
    directory = legacy.directory;
    warnings.push("Users Center directory recovery path used.", ...(legacy.warnings || []));
  }

  return (
    <AppShell
      account={gate.account}
      title="Users Center"
      eyebrow="Manage team access and member records"
      activePath="/next/users-center"
      bodyClass="user-access-page"
      pageStyles={["/next/css/user-access.css?v=next-stage-2o-modern-people-folders"]}
    >
      <UsersCenterClient
        initialDirectory={directory}
        initialSignupRequests={signup}
        bootstrapWarnings={warnings}
      />
    </AppShell>
  );
}
