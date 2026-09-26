import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import UsersCenterClient from "../../components/users-center/UsersCenterClient";
import { getDirectAccountGate } from "../../lib/products-auth";
import { usersCenterDirectory, usersCenterSignupRequests } from "../../lib/users-center-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

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


export default async function UsersCenterPage() {
  const gate = await getDirectAccountGate(ACCESS_PAGES);

  if (gate.status === 401) redirect("/login?next=/next/users-center");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to team members, departments, and page permissions." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The current ERP authentication service is temporarily unavailable."} />;
  }

  const [directoryResult, signupResult] = await Promise.allSettled([
    usersCenterDirectory(),
    usersCenterSignupRequests({ status: "pending" }),
  ]);

  if (directoryResult.status !== "fulfilled") {
    return <UnavailableState message={directoryResult.reason?.message || "Users Center data is temporarily unavailable."} />;
  }

  const directory = directoryResult.value;
  const signup = signupResult.status === "fulfilled"
    ? signupResult.value
    : { ok: true, requests: [] };
  const warnings = signupResult.status === "rejected"
    ? ["Sign up requests could not be loaded. Refresh to retry."]
    : [];

  return (
    <AppShell
      account={gate.account}
      title="Users Center"
      eyebrow="Manage team access and member records"
      activePath="/next/users-center"
      bodyClass="user-access-page"
      pageStyles={["/next/css/user-access.css?v=next-stage-2q-graphite-people-folders"]}
    >
      <UsersCenterClient
        initialDirectory={directory}
        initialSignupRequests={signup}
        bootstrapWarnings={warnings}
      />
    </AppShell>
  );
}
