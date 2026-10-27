# Projects Preparing – Phase 1 (27 Oct 2026)

## Goal
A new Operations preparing workspace for 30 June Schools (11 STEAM labs), reusable for other projects. A **Project folder** contains **beneficiary schools**; each school references one existing **Proposal**, and has its own ordered preparing stage history.

## What phase 1 delivers
- New `/next/projects-preparing` responsive page, folder view, search, project create/rename.
- Add multiple beneficiary users (existing `team_members`) to each folder and select one existing Proposal (`product_proposals`) for those beneficiaries. Repeat the add flow if different schools use different proposals.
- Nine persisted stages: Warehouse Receiving → Inventory & QC → Sorting & Preparing → Packing & Dispatch → School Delivery → Delivery Handover → Installation Follow-up → Testing & Commissioning → Final School Closing.
- Status and notes per stage; server and database enforce ordered completion. A stage can't be reopened while subsequent stages are completed.
- Two closing milestones: **Delivery Handover** (end of Operations' direct execution) and **Final School Closing** (end of Operations' technical follow-up).
- Counts of linked schools, delivered schools, closed schools; per-school progress and project summary.
- Four new audited server-gated permissions: `preparing.view`, `preparing.create`, `preparing.manage`, `preparing.stage_update`, plus a new `Projects Preparing` entry in Users Center > Page Access.
- Existing orders, proposals, kits, products and stocktaking tables remain unchanged. No example schools/projects are inserted into the production database.

## Production installation – important
1. Back up the production database; check that your existing `public.app_pages` schema supports the standard metadata columns used by Users Center.
2. Open **Supabase SQL Editor** and execute `sql/2026-10-27-preparing-projects-phase1.sql`. This creates three isolated RLS-protected tables, one stage-transition RPC, and the new page catalog row.
3. Upload the ZIP's changed files to the corresponding paths of the current GitHub repository, preserving folders (`EmptyCanvas/next-frontend/...`). Deploy the code to the existing production Next.js server. No staging or automatic deployment is performed by this patch.
4. Confirm the production server has a **private** `SUPABASE_SERVICE_ROLE_KEY` (or the existing supported server-side secret variant). The feature deliberately refuses to fall back to the anon key.
5. In **Users Center > Page Access**, give the intended Operations accounts `Projects Preparing` access.
6. If a user has **Advanced Permissions** enabled, also open Users Center > Advanced Permissions > Projects Preparing, enable that module and explicitly grant `View`, `Create`, `Manage`, and/or `Update stage` permissions. Without View, the page will remain hidden.
7. Refresh/re-sign-in when needed to pass the existing app_pages/member-access cache window (~60 seconds for app pages). Open `/next/projects-preparing` and create the `30 June Schools` folder, then assign the 11 school user accounts and source proposal(s).
8. Validate against a single test project/school first: create project; assign one school; progress receiving→handover; verify stage prerequisite and 403 guards; then add remaining schools. Do not use real closing statuses before agreeing on evidence requirements.

## What comes next (implementation plan)
**Phase 2 — Components & QC:** Proposal item snapshot and version, receiving manifest, planned vs received vs damaged/missing qty, scan/search, BOM with grade/kit tags, ownership and audit. Don't mutate the original Proposal.

**Phase 3 — Packing & Delivery:** Pick/pack rows, cartons, shipment assignment, delivery times, receipt evidence (files/photographs), logistics and handover documents, 1-week observation grace period and formal delivery closure.

**Phase 4 — Technical Follow-up:** Installation team owner and schedule, testing log, issues/Snag List with assignment, priority, deadlines, status, evidence and escalations; Operations follows but does not directly install.

**Phase 5 — Final Closure:** Explicit gates for signed handover and technical approval, closure authorization, finance/warehouse reconciliation, append-only activity log, PDF & Excel export, read-only closed records (controlled reopen permission).

**Phase 6 — Executive View:** School-by-school dashboard, timeline/dependencies, blockers, overdue alerts and configurable notifications, summary reports for all 11 schools. Add feature-level permission checks and data scopes as required.

## Current boundaries / acceptance conditions
- In phase 1 **only the Proposal header is referenced** (id and name); component rows are not yet snapshotted or counted. Do not interpret a completed stage as independently verified stocktaking or signed installation acceptance until phases 2–5 are finished.
- One school user can be linked **once per project**, with one Proposal; different source proposals across schools are supported by adding them in batches. Multi-Proposal per school requires a later schema extension.
- No deletion is implemented in this first safe production phase.
- Existing `team_members` includes all user profiles: select only actual school beneficiary accounts, not employees.
- `ERP_ADVANCED_PERMISSIONS_ENABLED=1` users with enabled profiles need explicit feature grants. Page Access is always required.
- Server-gated access is project-wide in phase 1; scoped school-level access is **not yet implemented**. Grant access to authorized Operations personnel only until row-level scopes are added.
- This patch wasn't connected to your live Supabase/ERP. The SQL was **not executed**, and the live production deployment **was not modified**.

## Tests completed locally
- `node --test tests/projects-preparing-phase1.test.mjs` — passed 3 tests for stage definition/order, progress and feature permissions.
- Typescript JavaScript/JSX parser validated the modified/new source files without syntax diagnostics.
- Real Next.js build, browser integration, actual SQL application and authenticated production smoke test require the deployed environment/dependencies and are not claimed as complete.
