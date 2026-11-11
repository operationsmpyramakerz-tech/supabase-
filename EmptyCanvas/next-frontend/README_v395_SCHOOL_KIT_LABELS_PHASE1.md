# v395 — School Kit Labels · Phase 1 of 4

## What is shipped

1. In **Projects Preparing → Box Distribution → Boxes Label**, choose a captured **School**, its **Kit group**, and the **number of physical kits** (1–100 per operation). Generate produces one immutable ID per physical Kit, e.g. `ADD-CITY-01`, `ADD-CITY-02`. Sequence never reuses canceled names; same-project school/group name collisions get a stable disambiguating suffix.
2. Every generated record is attached to the actual school ID (not merely school text), Kit group and sequence. Old manually created boxes remain in the database and visible, unmodified.
3. Tap an existing label to inspect **actual packed lines**; if none, view the school's Proposal components clearly marked as reference, not packed contents.
4. Existing component packing in Box Distribution can use the generated box, with server-side checks that the source component is from the designated school.
5. Generating labels **does not** mark components as physically packed, commit quantity, or seal/dispatch. Those are separate decisions, not side effects of printing a label.
6. Legacy pooled cartons remain in Project Kit Cartons for backward compatibility. Generated school Kit labels are hidden from that legacy workflow to avoid accidental conversion to a project-wide pool. Box Distribution no longer offers manual school-unassigned new box creation; older manual boxes remain visible and their history is preserved.

## Deploy order (IMPORTANT: production database)

1. Back up the production database and confirm the previously applied phase-7 and v249/v250 SQL migrations.
2. In Supabase SQL Editor, run **`sql/2026-11-11-preparing-school-kit-labels-v395.sql`** as a privileged database user. This is additive (new columns/indexes/one trigger/one RPC); existing box rows and quantities are not rewritten.
3. Deploy the changed app files.
4. With a user authorized for `Projects Preparing → Box Distribution → Edit All Components`, generate **one** test label for a real school/Kit pair, verify school association and click-through content. Then pack a single permitted component and confirm wrong-school source components are rejected.
5. Check the audit before generating large batches. Repeating Generate intentionally creates *additional* physical labels; it does not silently reset or overwrite existing ones.

## Roadmap: next phases (not included in v395)

- **Phase 2 — Kit packing and contents:** Track required quantities per school/Kit label, mark a physical Kit `Packed` only when its contents meet the expected contents, reconcile with Operations Received and build a traceable Kit manifest.
- **Phase 3 — Project Kit Cartons:** Choose a school; select only physically Packed Kit labels belonging to that school; pack them into a carton with unique `SCHOOL-01` style label; prevent using the same Kit in more than one active carton; preserve history.
- **Phase 4 — QR + templates:** Printable Box and Carton label templates, scan to a read-only contents page with minimal disclosure, authentication or scoped scan tokens, and historical content integrity; integration tests and edge-case validation.

## Operational notes

- There is currently a 500-active-box project limit inherited from the original carton pool. Increase the database limit in a reviewed migration if a project truly exceeds it.
- Label names are unique **within their project**. Use the internal UUID for global identification and future QR scanning; do not use the human-readable label alone to query across projects.
- Existing Project Kit Cartons is a legacy *shared carton pool*. The requested school-specific assembly is a separate next step, not yet substituted.
- SQL wasn't run on your production DB here. Perform a test transaction and verify the result before bulk generating labels.
