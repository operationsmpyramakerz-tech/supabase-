import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import ExpensesUsersClient from "../../../components/expenses/ExpensesUsersClient";
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
    if (url === prefix || url.startsWith(prefix)) return body;
  }
  return fallback;
}

export default async function ExpensesUsersPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=expenses-users", { timeoutMs: 35000 });

  if (response.status === 401) redirect("/login?next=/next/expenses/users");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Expenses Users is not available</h1>
          <p>Your account does not have access to the Expenses Users module.</p>
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
          <h1>The new Expenses Users page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/expenses/users?classic=1">Open classic Expenses Users</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const usersPayload = getResource(resources, "/api/expenses/users", { success: true, users: [] });
  if (!account) redirect("/login?next=/next/expenses/users");

  return (
    <AppShell account={account} title="Expenses by User" eyebrow="Review expenses by team member" activePath="/next/expenses/users" bodyClass="expenses-users-page" classicStyles={["/next/css/expenses-users-classic-inline.css?v=stage2f"]}>
      <ExpensesUsersClient
        account={account}
        initialUsersPayload={usersPayload || { success: true, users: [] }}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
