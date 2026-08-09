import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

const steps = [
  ["Foundation", "Completed", "Shared cookie authentication, Vercel proxy routing, and the legacy API adapter are operational."],
  ["Home dashboard", "Completed", "The live Home overview is rendered with Next.js while the classic Home remains available."],
  ["Current Orders", "Completed", "The first interactive list module includes tabs, search, order details, and protected order actions."],
  ["Order Tracking", "Completed", "Current Orders now has a dedicated Next.js delivery journey with durable order references, live stage refresh, component status, totals, product imagery, share/print controls, and migrated links from Expenses."],
  ["Orders Review", "Completed", "Supervisor review now supports filters, approval decisions, quantity overrides, protected editing, and archive controls in Next.js."],
  ["Operations Orders", "Completed", "Operations fulfilment now includes live workflow tabs, receipt quantities, approve/reject decisions, delivery controls, exports, and archive actions."],
  ["Maintenance Orders", "Completed", "The technical workflow now includes maintenance logs per component, spare-part tracking, signed report uploads, completion controls, and exports."],
  ["Shopping Cart", "Completed", "Create New Order now supports product requests, stock withdrawals, maintenance reports, per-type drafts, live catalogue selection, order editing, password confirmation, and submission through the existing ERP workflow."],
  ["Stocktaking", "Completed", "The live inventory view now includes grouped and table modes, instant search, stock-value summaries, and protected PDF/Excel exports."],
  ["Expenses", "Completed", "Cash-flow analytics, transaction filters, Cash in/out forms, settlement, receipts, and PDF/Excel exports now run in the Next.js interface."],
  ["Expenses Users", "Completed", "Team-wide balance cards, settlement-aware histories, date and type filters, receipt viewing, protected corrections, deletion, and per-user PDF/Excel exports now run in Next.js."],
  ["Products", "Completed", "The product catalogue now includes tag filters, search, grid/table views, product images, pricing, supplier links, and full product/tag/unit management in Next.js."],
  ["Proposals", "Completed", "Reusable quotation folders now include product, tag, and kit insertion, quantity controls, ownership protection, copies, combined proposals, PDF/Excel exports, and direct order creation in Next.js."],
  ["Kits", "Completed", "Reusable product bundles now include catalogue search, exact quantities, copies, ownership protection, live value summaries, and direct reuse inside proposals in Next.js."],
  ["B2C Database", "Completed", "The B2C database library now includes folder search, sorting, table analytics, create/edit/copy/delete controls, Excel exports, and safe classic fallbacks for individual table workspaces."],
  ["B2C Table Workspace", "Completed", "Individual customer tables now include dynamic record grids, search, pagination, record editing, attachments, protected deletion, schema configuration, formulas, linked forms, and Excel exports in Next.js."],
  ["B2C Forms", "Completed", "The form library, linked-table selection, dynamic customer entry, conditional questions, direct Storage uploads, metadata editing, and drag-and-drop Form Builder now run in Next.js."],
  ["Task Management", "Completed", "All Tasks, My Tasks, and Delegated Tasks now include workflow filters, calendar agenda, project details, project creation/editing, department work, team assignments, attachments, archive controls, and delivery actions in Next.js."],
  ["Events", "Completed", "Event Requests now include status tabs, type filters, request details, creator profiles, protected workflow transitions, Edit/Cancel authorization, PDF download, and direct links to the calendar and component catalogue."],
  ["New Event Request", "Completed", "Event creation and authorized editing now include live component catalogues, schedule-conflict notices, reusable event types, governorate transport rates, cost calculations, venue requirements, and complete request submission in Next.js."],
  ["Event Components", "Completed", "The reusable event catalogue now includes category and status filters, cost summaries, compressed photos, custom categories, protected create/edit actions, and Admin-only deletion in Next.js."],
  ["Event Calendar", "Completed", "The monthly schedule now includes date navigation, selected-day conflicts, upcoming and past lists, full event details, PDF access, and protected event creation links in Next.js."],
  ["KPIs", "Completed", "Employee performance now includes monthly score trends, review filters, KPI standards, protected standard/review creation, evidence files, score editing, and PDF reports in Next.js."],
  ["Users Center", "Completed", "Team directories, account records, department management, sign up approvals, page-access matrices, and Orders Review visibility now run in the protected Next.js workspace."],
  ["My Account", "Completed", "Personal details, password changes, profile and cover images, shared files, access summaries, protected profile updates, and sign-out controls now run in Next.js."],
  ["System History", "Completed", "The audit trail now includes live summaries, search and multi-field filters, action details, linked team-member profiles, technical request metadata, refresh controls, and protected full-history deletion in Next.js."],
  ["Database Backup", "Completed", "The protected database workspace now includes a searchable Supabase table catalogue, individual CSV and full ZIP exports, schema-validated CSV restores, automatic export-before-delete safeguards, and audited table or database clearing in Next.js."],
  ["Notifications", "Completed", "The personal activity feed now includes a global Next.js bell, unread badges, search and timeline filters, read controls, migrated destination links, browser push subscription management, and a full notification center."],
  ["How it works", "Completed", "The permission-aware Operations SOP now runs inside Next.js with preserved classic guide content, live access filtering, full-text search, process flows, quick section navigation, and direct links to migrated modules."],
  ["LMS Home", "Completed", "The learning overview now includes live school, role, structure, curriculum, and resource analytics with permission-aware links to each LMS workspace."],
  ["LMS Users Center", "Completed", "Learning structures and all seven LMS role directories now run in a permission-aware Next.js workspace with a visual workflow builder."],
  ["LMS Schools", "Completed", "School folders, contract and contact data, academic coverage, capacity metrics, Stocktaking links, protected create/edit/delete actions, and contract uploads now run in Next.js."],
  ["LMS Curriculum", "Completed", "Curriculum groups, theme and grade folders, protected learning files, direct Storage uploads, resource management, and the in-system preview viewer now run in Next.js."],
  ["LMS School Workspace", "Completed", "Individual school profiles now include live grouped stocktaking, protected inventory sessions, debounced Inventory and Defected updates, mismatch monitoring, and PDF/Excel exports in Next.js."],
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
