# v397 — Phase 3: School Kit Cartons

This release is **Phase 3 of 4**. It turns verified **Packed** (v396) school-specific physical Kit labels into school-specific, immutable outer cartons. **QR print templates and scanning pages belong to Phase 4 and are not included yet.**

## Deploy on the live system, in this order

1. Take a tested Supabase backup. Confirm migrations through `sql/2026-11-11-preparing-school-kit-packing-v396.sql` have been applied.
2. Run **`sql/2026-11-11-preparing-school-cartons-v397.sql`** in the privileged Supabase SQL editor **before deploying v397 application code**. It adds two new tables, an atomic RPC, access restrictions, and write guards; no existing project cartons, labels, contents, or allocations are rewritten.
3. Replace the project files at their exact paths from this archive, then deploy. Verify `SUPABASE_SERVICE_ROLE_KEY` (or the already-supported equivalent) is configured on the server only.
4. On a controlled test project, first mark two physical School Kit labels as **Packed** in Box Distribution, open **Project Kit Cartons**, choose the same school, select the two kits, and press **Pack Carton**. Check that one carton (e.g. `CITY-01`) appears under **Packed Cartons**, containing both original Kit labels and their actual product quantities.
5. Try a second carton: the Kits from the first one must no longer appear as selectable. School B's ready kits must never appear under School A. Verify an authorized user with `Project Kit Cartons` edit permission can pack; a read-only user cannot. Check Project Overview stage 6 progress after adding a carton.

**No live DB changes or production deploy were executed in this work session.** A full Next.js build was not run (the archive does not contain installed node_modules); JavaScript/JSX was syntax checked separately.

## Workflow

1. **Box Distribution**: physical school Kits have immutable labels, a fixed packing manifest, and verified status `ready` only after every component meets its target.
2. **Project Kit Cartons → School Cartons**: select the school first. The list shows only **that school's completed and not-yet-cartoned Kits**. Optionally select a whole Kit group or choose individual labels from several groups.
3. Press **Pack Carton**. One server-side database transaction locks the project, checks that every selected Kit belongs to the school, has exact physical contents, is marked ready, and is not already used. It creates exactly one outer carton and its Kit membership entries, then returns its generated label (`CITY-01`, `CITY-02`, etc.). Codes remain unique within the project even if schools have similar names or two staff initiate packing concurrently.
4. **Packed Cartons** shows each school carton. Click its code to reveal its constituent Kit labels; expand a Kit to inspect its stored product names and actual packed quantities. The cartons and membership rows are intentionally immutable in v397.
5. **Legacy Cartons** opens the original legacy project-wide carton-management screen. No automatic migration, mixing, or release of legacy stock takes place.

## Important boundaries

- Creating a physical **Kit Label** does not pack it; *only* a Kit completed through the v396 manifest is eligible for outer carton packing.
- One physical Kit can belong to **only one** outer carton; IDs are globally unique through a DB constraint. An outer carton cannot combine schools, and new cartons require the existing stage and per-tab edit permission. The API independently validates these permissions.
- A packed carton is a final, immutable record. **No direct cancel, delete, renaming, splitting, or re-packing** is offered in this phase. Incorrect physical packing must be handled through a future audited correction flow, not a silent edit.
- New cartons use the **separate** tables `erp_preparing_school_cartons` and `erp_preparing_school_carton_kits`, with RLS, service-role-only access and insert guards. Old `erp_preparing_project_cartons`, `erp_preparing_project_carton_lines`, and audit rows stay intact.
- The Stage 6 progress metric now counts physical Kit quantities in actual school cartons, plus sealed legacy project cartons. Loose, ready-but-un-cartoned school Kits no longer increase carton stage completion. Explicit signed stage closure still takes precedence.
- QR download templates and authenticated read-only scan-to-content views are deliberately postponed to Phase 4.

## Scope/automated checks

- New model tests cover school boundaries, membership uniqueness, partial/draft exclusion, manifest composition, immutable SQL, per-tab access and Stage 6 progress.
- Project Preparing suite: **358/364 passing**. The 6 remaining failures are legacy assertions for Testing/Warehouse UI and headers/inputs, outside files changed by this release (same baseline count reported for v396).
- JavaScript/JSX syntax is checked; no live DB execution, visual browser test or full Next.js build.
