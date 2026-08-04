import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

const steps = [
  ["Foundation", "Completed", "Shared cookie authentication, Vercel proxy routing, and the legacy API adapter are operational."],
  ["Home dashboard", "Completed", "The live Home overview is rendered with Next.js while the classic Home remains available."],
  ["Current Orders", "Completed", "The first interactive list module includes tabs, search, order details, and protected order actions."],
  ["Orders Review", "Completed", "Supervisor review now supports filters, approval decisions, quantity overrides, protected editing, and archive controls in Next.js."],
  ["Operations Orders", "Completed", "Operations fulfilment now includes live workflow tabs, receipt quantities, approve/reject decisions, delivery controls, exports, and archive actions."],
  ["Maintenance Orders", "Completed", "The technical workflow now includes maintenance logs per component, spare-part tracking, signed report uploads, completion controls, and exports."],
  ["Stocktaking", "Completed", "The live inventory view now includes grouped and table modes, instant search, stock-value summaries, and protected PDF/Excel exports."],
  ["Expenses", "Completed", "Cash-flow analytics, transaction filters, Cash in/out forms, settlement, receipts, and PDF/Excel exports now run in the Next.js interface."],
  ["Products", "Completed", "The product catalogue now includes tag filters, search, grid/table views, product images, pricing, supplier links, and full product/tag/unit management in Next.js."],
  ["Task Management", "Completed", "All Tasks, My Tasks, and Delegated Tasks now include workflow filters, calendar agenda, project details, project creation/editing, department work, team assignments, attachments, archive controls, and delivery actions in Next.js."],
  ["Events", "Completed", "Event Requests now include status tabs, type filters, request details, creator profiles, protected workflow transitions, Edit/Cancel authorization, PDF download, and direct links to the calendar and component catalogue."],
  ["Progressive rollout", "In progress", "Continue replacing approved list pages individually while preserving legacy fallbacks."],
];

export default async function MigrationStatusPage() {
  const accountResponse = await fetchLegacyJson("/api/account", { timeoutMs: 9000 });
  if (accountResponse.status === 401 || accountResponse.status === 403) redirect("/login?next=/next/migration-status");
  if (!accountResponse.ok || !accountResponse.data) redirect("/home");

  return (
    <AppShell account={accountResponse.data} activePath="/next/migration-status">
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
