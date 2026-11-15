# v413 — Automatic Physical Kit Closure + Multi-school Label Generation

Base: user-provided `supabase--main-410.zip`. Only Box Distribution / Boxes Label workflows were changed.

## 1. Requested changes

1. A generated physical school Kit changes from `draft` / `Pending Packing` to `ready` / `Packed · Verified` **automatically inside the packing SQL transaction**, when each of its Required component quantities matches its actual Packed quantity, with no unexpected component lines and at least one required manifest line. The current signed-in packer is recorded by the existing `kit_complete` audit path. The Kit is then locked, as before, and becomes eligible for Project Kit Cartons.
2. Removed the `School Proposal components (reference only...)` section and the separate `Mark Kit as Packed` button from the Kit contents modal. The Required/Packed/Remaining manifest, Box details and QR download remain.
3. The generator supports multiple schools, checkbox selection, search, `Select all` and a shared Kit group, with the number typed interpreted as **labels per selected school**. The batch is an all-or-nothing database operation, preserving the permanent label ID rules and school-specific Proposal validation.

## 2. Deployment on the LIVE ERP (order is important)

**Back up the self-hosted Supabase database first.** Do not apply an unreviewed SQL migration to production. Ensure original v395, v396 and v399 SQL migrations are already installed.

1. Run `sql/2026-11-15-preparing-school-kits-auto-complete-multischool-v413.sql` **once**, using the authorized Supabase SQL editor/account. This creates two restricted `service_role` RPCs. It also **immediately marks already-fully-packed existing draft generated Kits as ready** if, and only if, their persisted per-component target quantities exactly match persisted physical contents. Audit actor on these historical automatic closures is `AUTO-PACKING-V413`. Incomplete/extra/mismatched contents are unchanged. It does not change packed quantities, targets, schools, labels or ready Kits.
2. Deploy the changed source files (or full code), preserving their original paths. **Do not deploy v413 application code before its SQL functions exist.** Cache revision in `app/projects-preparing/page.jsx` is bumped.
3. Hard refresh the ERP. For an existing Kit displaying 5 / 5, check it now appears `Packed · Verified` only when all component lines match. Check there is a `kit_complete` audit event. Check QR remains downloadable.
4. On a controlled *draft* group with multiple components, save partially packed units: the Kit must stay `Pending Packing`. After packing the final missing component via `Pack by School`, the SQL transaction must close all qualifying physical Kits for the selected schools. Confirm they appear under Project Kit Cartons and no longer allow packing edits.
5. Select 2+ schools in Boxes Label, choose a common Kit group, enter `2`, and generate. Both schools should get 2 individually numbered labels. Try a batch where one school has an existing plan or wrong Kit group: the database must reject the entire batch (no partial generation).

## 3. Safety and permissions

- Existing edit-tab and stage permissions remain in force in the Next.js API routes. The `service_role`-restricted SQL RPCs cannot be invoked by `anon`/`authenticated` roles directly.
- v399 packing constraints (verified project/school/component, identical whole-number distribution, available Operations Received stock, school BOM and frozen ready boxes) remain in effect.
- v396 completion checks and irreversibility remain the final authority; there is no client-side "mark as done" shortcut.
- Multi-school label generation reuses the original v395 verifier for each school **inside one SQL transaction**; errors roll back every school.
- Existing fully complete draft Kits are closed by the migration. **This is an intentional state change.** Review the migration and back up before running it.

## 4. Verification

- New + updated target suites: 32/32 passed.
- Full Node test suite: 1148 passed / 1187 total, with 39 existing unrelated failures.
- JSX transpilation syntax check and CSS parser check passed.
- No live self-hosted Supabase or browser QA was performed. SQL transaction runtime was reviewed but not executed against the live schema in this environment. The full Next.js build was not run (no node_modules in the archive).
