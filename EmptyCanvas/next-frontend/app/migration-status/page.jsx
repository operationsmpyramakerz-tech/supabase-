import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

const steps = [
  ["Foundation", "Completed", "Shared cookie authentication, reverse proxy, PM2 process, and legacy API adapter."],
  ["Home pilot", "Completed", "A server-rendered Next.js page is available without changing the current Home page."],
  ["Selected module", "Next", "Move one low-risk module after comparing loading time and behavior with the current page."],
  ["Progressive rollout", "Planned", "Replace approved pages individually while preserving legacy fallbacks."],
];

export default async function MigrationStatusPage() {
  const accountResponse = await fetchLegacyJson("/api/account", { timeoutMs: 9000 });
  if (accountResponse.status === 401 || accountResponse.status === 403) redirect("/login?next=/next/migration-status");
  if (!accountResponse.ok || !accountResponse.data) redirect("/home");

  return (
    <AppShell account={accountResponse.data}>
      <section className="status-page">
        <article className="wide-card status-intro">
          <div>
            <span className="pill">Migration control</span>
            <h2>Next.js adoption remains incremental</h2>
            <p>The current Express application stays responsible for APIs and business rules. Only approved browser pages move to Next.js.</p>
          </div>
        </article>

        <div className="timeline">
          {steps.map(([title, status, description], index) => (
            <article className="timeline-item" key={title}>
              <span className="timeline-number">{index + 1}</span>
              <div>
                <div className="timeline-heading"><h3>{title}</h3><em>{status}</em></div>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
