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
  ["Event Components", "Completed", "The reusable event catalogue now includes category and status filters, cost summaries, compressed photos, custom categories, protected create/edit actions, and Admin-only deletion in Next.js."],
  ["Event Calendar", "Completed", "The monthly schedule now includes date navigation, selected-day conflicts, upcoming and past lists, full event details, PDF access, and protected event creation links in Next.js."],
  ["KPIs", "Completed", "Employee performance now includes monthly score trends, review filters, KPI standards, protected standard/review creation, evidence files, score editing, and PDF reports in Next.js."],
  ["Users Center", "Completed", "Team directories, account records, department management, sign up approvals, page-access matrices, and Orders Review visibility now run in the protected Next.js workspace."],
  ["LMS Home", "Completed", "The learning overview now includes live school, role, structure, curriculum, and resource analytics with permission-aware links to each LMS workspace."],
  ["LMS Users Center", "Completed", "Learning structures and all seven LMS role directories now run in a permission-aware Next.js workspace with a visual workflow builder."],
  ["LMS Schools", "Completed", "School folders, contract and contact data, academic coverage, capacity metrics, Stocktaking links, protected create/edit/delete actions, and contract uploads now run in Next.js."],
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
