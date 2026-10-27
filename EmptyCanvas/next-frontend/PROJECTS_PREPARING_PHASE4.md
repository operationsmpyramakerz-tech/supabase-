# Projects Preparing — Phase 4 (v216): Technical Follow-up

**Input baseline:** `supabase--main-215.zip`. **Delivery:** changed files only; SQL migration included both in the ZIP and as a standalone file. **Production:** no live changes or database migrations have been executed by this work.

## Purpose and responsibilities

Operations **executes** receiving, QC, preparing, packing, dispatch and signed delivery (stages 1–6). Operations **coordinates and follows up**, but does not perform, installation and technical commissioning (stages 7–8). The technical team provides the checkpoint confirmations and actual acceptance evidence. Final school administrative closure (stage 9) is reserved for Phase 5.

## Added in this phase

- **Open Technical** bottom sheet inside each school's folder.
- 4 installation checkpoints: site utilities / safety readiness; equipment installation; cabling and safety; software configuration.
- 4 testing checkpoints: power on; functional testing; safety validation; technical handover and orientation.
- Each checkpoint tracks status, **technical owner**, due date, notes, optional HTTPS evidence and last update. Completed checkpoints require an assigned technical owner.
- **Issues**: title, description, priority/severity, assigned technical team/owner, due date, open/in-progress/resolved state, resolution notes and evidence link. Resolution notes are required before resolving; all changes are audited. Export issues CSV with spreadsheet-formula escaping.
- **Technical Acceptance**: log the name of the actual technical team member, acceptance date, *existing* signed-document/reference number, optional HTTPS evidence URL and notes. The entry is a reference to evidence, **not** a digital signature or proof that the source document is authentic.
- Four new, RLS-protected tables (checklist, issues, acceptance and audit), four transaction-locked RPC functions and a gated API route. No changes to core Orders, Proposals, Warehouse or BOM tables.
- Both Stage 7 and Stage 8 completion gates are enforced **inside the existing database stage RPC**, retaining all Phase 2/3 quantity and delivery gates.
- Stage 7 can only complete with the four installation checkpoints complete; Stage 8 with four testing checkpoints completed, zero unresolved issues and a recorded technical acceptance.
- Any subsequent update to a technical checkpoint or issue invalidates the old acceptance record (audit entry retained). Mutations are blocked once the associated stage is completed until it is reopened. Existing stage ordering still applies.
- **Stage 9 / Final School Closing cannot be newly marked completed** until Phase 5 implements closure controls. Existing completed stage rows are unchanged by the migration.
- Existing Page Access and feature permissions: `preparing.view` for viewing, `preparing.stage_update` for updates. No automatic admin-forced email/push; automated reminders/notifications are not implemented yet. No extra permissions or user center changes required.

## Install (single existing Production — cautious change)

1. **Back up** current Production Supabase/database and deployed app revision. Ensure phases 1–3 migrations have already been applied and screens are working.
2. Run `sql/2026-10-27-preparing-technical-phase4.sql` in the privileged Supabase SQL Editor **once**, before deploying changed code. It is a single `BEGIN` / `COMMIT` transaction with additional tables and only the Preparing-stage RPC being replaced.
3. Copy **changed files only** from the ZIP into the **same original paths** relative to repository root (example: `EmptyCanvas/next-frontend/components/preparing/TechnicalFollowUp.jsx`), commit and deploy the updated app to the existing server. Do not replace the whole repository from the ZIP.
4. Log in with a user who has `Projects Preparing` Page Access plus `preparing.view` and `preparing.stage_update`. Open `Projects Preparing` → folder → school → **Open Technical**.
5. Use a disposable **test project/school and proposal** first. The technical actions will only be editable after `Delivery Handover` is completed in that test school's existing workflow.

## Safe smoke-test scenario

1. On a test school with already recorded complete school delivery, open Technical and update one installation item with technical owner, due date and notes. Verify a second user refresh sees it. Confirm view-only accounts cannot edit.
2. Finish all four installation items. Try marking Stage 7 complete with 3/4 and observe server rejection; with 4/4 complete the stage should complete.
3. Open Testing and complete 4 test checkpoints; log an open critical snag. Try recording technical acceptance — it should be refused while issue remains open.
4. Set snag `resolved` with written resolution. Enter a real technical acceptance document reference. Verify it appears on the read view and in the database audit.
5. Reopen an issue: acceptance should be invalidated (this action requires Testing to remain uncompleted). Resolve and record acceptance again.
6. Complete Stage 8. Try editing issues/checkpoints: the server should block changes until Testing is reopened. Verify Stage 9 currently remains unavailable.
7. Ensure Stage 1–6 controls still reject incomplete quantities, missing cartons and delivery discrepancies. Check read-only permissions.

## Important limitations

- No automatic messaging/reminders, scanned file upload, document signing, or technical team's own remote approval account in Phase 4. Technical acceptance is an Operations log of a **real** technical confirmation, not generated proof.
- No direct integration with inventory stock or maintenance tickets; technical issues are tracked only inside the project.
- Phase 5 will deliver formal Final School Closing with supporting administrative approvals, completeness checks and reporting.
- Technical records cannot be edited before completed Delivery Handover, and the record remains frozen when Testing is closed unless users deliberately reopen that stage.
- Existing manually-completed technical stages are **not backfilled or revalidated**; review any old completion records if they existed before this migration.
- At most 200 technical issue records per school; 8 fixed checkpoint keys per school.
- This archive contains no `node_modules`; **Next.js full build, connected Supabase SQL execution, authenticated browser smoke test and production deploy have NOT been performed**. Passing automated tests and JS/JSX parsing do not substitute for those steps.

## Test results (local)

`node --test tests/projects-preparing-phase1.test.mjs tests/projects-preparing-phase2.test.mjs tests/projects-preparing-phase3.test.mjs tests/projects-preparing-phase4.test.mjs tests/projects-preparing-sidebar-v212.test.mjs` — 23 passing checks.

JavaScript and JSX syntax parsing via TypeScript parser — all six changed or dependent code files parsed successfully.
