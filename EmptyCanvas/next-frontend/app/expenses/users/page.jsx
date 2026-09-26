import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import ExpensesUsersClient from "../../../components/expenses/ExpensesUsersClient";
import { getDirectAccountGate } from "../../../lib/products-auth";
import { expenseUsersSummary } from "../../../lib/expenses-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function UnavailableState({ message, forbidden = false }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>{forbidden ? "Expenses Users is not available" : "The new Expenses Users page could not load"}</h1>
        <p>{message}</p>
        <div className="actions">
          {!forbidden ? <a className="primary-button" href="/next/expenses/users">Try again</a> : null}
          <a className={forbidden ? "primary-button" : "secondary-button"} href="/next/home">Return to Home</a>
        </div>
      </section>
    </main>
  );
}


export default async function ExpensesUsersPage() {
  const gate = await getDirectAccountGate(["Expenses Users"]);

  if (gate.status === 401) redirect("/login?next=/next/expenses/users");
  if (gate.status === 403) {
    return <UnavailableState forbidden message="Your account does not have access to the Expenses Users module." />;
  }
  if (!gate.ok || !gate.account) {
    return <UnavailableState message={gate.error || "The current ERP authentication service is temporarily unavailable."} />;
  }

  let usersPayload;
  try {
    usersPayload = {
      success: true,
      users: await expenseUsersSummary(),
      source: "supabase-next",
    };
  } catch (directError) {
    return <UnavailableState message={directError?.message || "Expense-user data is temporarily unavailable."} />;
  }

  return (
    <AppShell
      account={gate.account}
      title="Expenses by User"
      eyebrow="Review expenses by team member"
      activePath="/next/expenses/users"
      bodyClass="expenses-users-page"
      pageStyles={["/next/css/expenses-users-classic-inline.css?v=stage2f"]}
    >
      <ExpensesUsersClient
        initialUsersPayload={usersPayload || { success: true, users: [] }}
        bootstrapWarnings={[]}
      />
    </AppShell>
  );
}
