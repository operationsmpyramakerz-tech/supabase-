import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { getLegacyAccountGate } from "../../lib/products-auth";

export const dynamic = "force-dynamic";

const steps = [
  ["Foundation", "Verified", "The Next.js deployment is now self-contained for authentication, business APIs, data access, PWA assets, and scheduled notification scans. The Express project is reduced to a compatibility shell for final cutover QA."],
  ["Authentication & Login", "Functional", "Sign-in, logout, password recovery, sign-up requests, session validation, and authorization now run directly in Next.js using the shared Redis/Upstash session store and Supabase."],
  ["Home dashboard", "Functional", "The live Home overview and analysis datasets are rendered directly from Next.js/Supabase; the old Home route is only a compatibility redirect."],
  ["Current Orders", "Functional", "The first interactive list module includes tabs, search, order details, and protected order actions."],
  ["Order Tracking", "Functional", "Current Orders now has a dedicated Next.js delivery journey with durable order references, live stage refresh, component status, totals, product imagery, share/print controls, and migrated links from Expenses."],
  ["Order Receipt Viewer", "Functional", "Expense-linked order receipts now open in a protected Next.js gallery with image previews, PDF/file handling, search and type filters, refresh, print/share controls, and compatibility with both Supabase and legacy Notion order references."],
  ["Orders Review", "Functional", "Supervisor review now supports filters, approval decisions, quantity overrides, protected editing, and archive controls in Next.js."],
  ["Operations Orders", "Functional", "Operations fulfilment now includes live workflow tabs, receipt quantities, approve/reject decisions, delivery controls, exports, and archive actions."],
  ["Maintenance Orders", "Functional", "The technical workflow now includes maintenance logs per component, spare-part tracking, signed report uploads, completion controls, and exports."],
  ["Shopping Cart", "Functional", "Create New Order now supports product requests, stock withdrawals, maintenance reports, per-type drafts, live catalogue selection, order editing, password confirmation, and direct Next.js/Supabase submission."],
  ["Stocktaking", "Functional", "The live inventory view now includes grouped and table modes, instant search, stock-value summaries, and protected PDF/Excel exports."],
  ["Expenses", "Functional", "Cash-flow analytics, transaction filters, Cash in/out forms, settlement, receipts, and PDF/Excel exports now run in the Next.js interface."],
  ["Expenses Users", "Functional", "Team-wide balance cards, settlement-aware histories, date and type filters, receipt viewing, protected corrections, deletion, and per-user PDF/Excel exports now run in Next.js."],
  ["Products", "Functional", "The product catalogue now includes tag filters, search, grid/table views, product images, pricing, supplier links, and full product/tag/unit management in Next.js."],
  ["Proposals", "Functional", "Reusable quotation folders now include product, tag, and kit insertion, quantity controls, ownership protection, copies, combined proposals, PDF/Excel exports, and direct order creation in Next.js."],
  ["Kits", "Functional", "Reusable product bundles now include catalogue search, exact quantities, copies, ownership protection, live value summaries, and direct reuse inside proposals in Next.js."],
  ["B2C Database", "Functional", "The B2C database library now includes folder search, sorting, table analytics, create/edit/copy/delete controls, Excel exports, and direct Next.js/Supabase table workspaces."],
  ["B2C Table Workspace", "Functional", "Individual customer tables now include dynamic record grids, search, pagination, record editing, attachments, protected deletion, schema configuration, formulas, linked forms, and Excel exports in Next.js."],
  ["B2C Forms", "Functional", "The form library, linked-table selection, dynamic customer entry, conditional questions, direct Storage uploads, metadata editing, and drag-and-drop Form Builder now run in Next.js."],
  ["Task Management", "Functional", "All Tasks, My Tasks, and Delegated Tasks now include workflow filters, calendar agenda, project details, project creation/editing, department work, team assignments, attachments, archive controls, and delivery actions in Next.js."],
  ["Events", "Functional", "Event Requests now include status tabs, type filters, request details, creator profiles, protected workflow transitions, Edit/Cancel authorization, PDF download, and direct links to the calendar and component catalogue."],
  ["New Event Request", "Functional", "Event creation and authorized editing now include live component catalogues, schedule-conflict notices, reusable event types, governorate transport rates, cost calculations, venue requirements, and complete request submission in Next.js."],
  ["Event Components", "Functional", "The reusable event catalogue now includes category and status filters, cost summaries, compressed photos, custom categories, protected create/edit actions, and Admin-only deletion in Next.js."],
  ["Event Calendar", "Functional", "The monthly schedule now includes date navigation, selected-day conflicts, upcoming and past lists, full event details, PDF access, and protected event creation links in Next.js."],
  ["KPIs", "Functional", "Employee performance now includes monthly score trends, review filters, KPI standards, protected standard/review creation, evidence files, score editing, and PDF reports in Next.js."],
  ["Users Center", "Functional", "Team directories, account records, department management, sign up approvals, page-access matrices, and Orders Review visibility now run in the protected Next.js workspace."],
  ["My Account", "Functional", "Personal details, password changes, profile and cover images, shared files, access summaries, protected profile updates, and sign-out controls now run in Next.js."],
  ["System History", "Functional", "The audit trail now includes live summaries, search and multi-field filters, action details, linked team-member profiles, technical request metadata, refresh controls, and protected full-history deletion in Next.js."],
  ["Database Backup", "Functional", "The protected database workspace now includes a searchable Supabase table catalogue, individual CSV and full ZIP exports, schema-validated CSV restores, automatic export-before-delete safeguards, and audited table or database clearing in Next.js."],
  ["Notifications", "Functional", "The personal activity feed now includes a global Next.js bell, unread badges, search and timeline filters, read controls, migrated destination links, browser push subscription management, and a full notification center."],
  ["How it works", "Functional", "The permission-aware Operations SOP now runs inside Next.js with preserved classic guide content, live access filtering, full-text search, process flows, quick section navigation, and direct links to migrated modules."],
  ["App Install & PWA", "Functional", "The installed-app launcher, PWA diagnostics, browser installation flow, native download links, service-worker refresh controls, offline fallback behavior, and Next.js app shortcuts now use the migrated frontend."],
  ["Legacy URL cutover", "Completed", "Legacy ERP browser URLs now redirect to their migrated Next.js workspaces while preserving query parameters and dynamic deep links; business APIs no longer execute in Express."],
  ["Legacy route hardening", "Completed", "Old browser routes and .html bookmarks are compatibility redirects only. Unknown legacy API requests fail explicitly instead of falling back to monolithic business logic."],
  ["Classic rollback removal", "Completed", "User-facing Classic rollback links and runtime API fallbacks are removed. Rollback is deployment-controlled and no longer depends on the Express business layer."],
  ["Visual parity with Classic", "In progress", "Stage 2 now covers the Classic Login, authenticated global shell (sidebar/header/notifications), Home dashboard, Current Orders, Orders Review, Operations Orders, Maintenance Orders, Shopping Cart/Create Order, Products, Stocktaking, Expenses, Expenses Users, Proposals, Kits, B2C Database, B2C Table Workspace, B2C Forms, Task Management, Event Requests, New/Edit Event Request, Event Components, Event Calendar, KPIs, Users Center, and My Account. Stage 2N reuses the original Account page styling and restores the Classic cover/profile presentation, editable field rows, password-confirmed account updates, profile/cover image controls, Files & media cards, Classic edit/upload dialogs, and matching loading behavior while preserving the existing account APIs."],
  ["Responsive parity", "In progress", "The Stage 2 shell, Login/Home, Current Orders, Orders Review, Operations Orders, Maintenance Orders, Shopping Cart/Create Order, Products, Stocktaking, Expenses, Expenses Users, Proposals, Kits, B2C Database, B2C Table Workspace, B2C Forms, Task Management, the complete Events workspace, KPIs, Users Center, and My Account now reuse the Classic responsive layout rules. Tablet/mobile behavior still requires page-by-page visual QA before approval."],
  ["Page-by-page QA", "Pending", "Each module must pass functional, permissions, data, visual, responsive, and rollback checks before production approval."],
  ["Backend retirement preparation", "Completed", "The Express runtime is reduced to a lightweight health/static/bookmark compatibility shell. PWA assets and the notification cron are owned by the Next.js deployment, so final backend shutdown is now a routing/deployment step rather than an application migration task."],
];

export default async function MigrationStatusPage() {
  const gate = await getLegacyAccountGate([]);
  if (gate.status === 401 || gate.status === 403) redirect("/login?next=/next/migration-status");
  if (!gate.ok || !gate.account) redirect("/home");

  return (
    <AppShell account={gate.account} activePath="/next/migration-status">
      <section className="status-page">
        <article className="wide-card status-intro">
          <div>
            <span className="pill">Migration control</span>
            <h2>Next.js migration is functionally complete; final retirement QA is in progress</h2>
            <p>Business APIs, authentication, scheduled notifications, storage, and PWA assets now run in Next.js/Supabase. The remaining Express deployment is a compatibility shell only; visual/responsive QA and final domain cutover are the remaining release checks.</p>
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
