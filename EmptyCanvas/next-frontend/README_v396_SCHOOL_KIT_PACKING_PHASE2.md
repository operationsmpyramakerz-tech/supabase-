# v396 — School Kit Packing · Phase 2 of 4

## Scope

This release is **Phase 2 only**. School-specific Kit labels were generated in v395. This phase adds per-physical-label **required / packed / remaining** manifests and a server-verified **Mark Kit as Packed** transition. School-specific Project Kit Cartons (phase 3) and printable QR labels (phase 4) are **not included**.

## Deploy safely on production

1. **Back up Supabase** before applying this migration. Confirm v395 SQL and all earlier phase-7 / v247 / v249 / v250 migrations have been applied.
2. Apply **`sql/2026-11-11-preparing-school-kit-packing-v396.sql`** in the Supabase SQL editor, using an authorized privileged database account. This script creates `erp_preparing_school_kit_targets`, SQL guards and three privileged RPCs. It does not rewrite legacy cartons, labels, packed line quantities, history, or existing user permissions.
3. Deploy the modified project files from the provided zip, preserving their repository-relative paths. SQL must run before the new app code because the workspace now fetches the new targets table.
4. Test with a real school and **two generated labels** in a controlled project: initialize the plan, pack part of one Kit, confirm it cannot be completed, finish all its required contents, and mark it Packed. Verify it no longer accepts edits / cancellation. Verify the other Kit remains independently draft.
5. Verify production stock limits still apply to each physical pack quantity, that a user without `Box Distribution → Edit All Components` cannot prepare/complete manifests, and that the existing legacy Project Kit Cartons still operate unchanged.

**No operations were run against the live Supabase or Production server.** A complete `next build` was not run because this archive has no installed `node_modules`. Node tests and JSX parsing are reported separately.

## Operational workflow

1. Open **Projects Preparing → Box Distribution → Boxes Label**.
2. Generate *all* required physical labels for one school and Kit group **before** preparing its plan. Label count is deliberately locked once that school/group's plan or physical packing exists; this prevents changing targets under active labels.
3. Tap a generated label, click **Prepare Kit Packing Plan**. This atomically creates required quantities for **all current labels in that school/group**. The system reads school-specific `source_kits[].quantity` from the captured Proposal, not the project-wide total. Quantities are distributed across physical labels in order of `label_sequence`, preserving the school's total exactly. Pre-existing v395 packed contents are retained and counted first; unassigned remainder is shared across labels.
4. Inspect each label's **Required / Packed / Remaining** list. When the physical Kit's actual requirements differ from even distribution, use **Adjust expected contents between school Kits**: move a component's expected units between two uncompleted labels for the same school/group, without changing the school BOM total. This is audited and cannot reduce the source expected qty below its already packed qty.
5. Record actual physical packing per component via **Edit** inside the Kit inspection panel, or via the stage All Components editor. The database requires each packed line to match one of that label's expected items and not exceed its expected amount; existing v247 Production stock limits remain in place.
6. **Mark Kit as Packed** is enabled only when every expected line is present at exactly its required quantity and no extra lines exist. The SQL function rechecks the entire manifest atomically and seals the Kit as `status='ready'`. It is thereafter read-only and cannot be directly canceled.
7. Ready school Kits are staged for the separate **Phase 3 — Project Kit Cartons** implementation; **no** school carton assembly occurs in v396.

## Exceptions / compatibility

- Earlier v395 physical packing in a label is retained when generating targets. If its total **exceeds that school/group's Proposal** or contains unmatched component lines, initialization is rejected rather than silently correcting history. Staff can inspect the pre-plan box and explicitly unpack the problem line through the provided two-step control; the operation uses the existing audited Production pack endpoint.
- If school BOM contains duplicate product code/name rows within the same group, planning fails safely; otherwise the system cannot unambiguously match a physical line to a captured component.
- If a label has no assigned physical contents after distribution (e.g. too many labels for the school's BOM), plan initialization fails. Review school/group quantities and labels before work begins.
- Once a plan is established, generated labels cannot be canceled or extended. A future version may add an **audited plan reset / reversal** workflow if needed, but this version does not silently invalidate previously generated labels or completed Kits.
- Legacy manually created boxes and old shared project-carton workflow are untouched and separate. Their `status='ready'` is not the same thing as a verified school Kit from v396.
- The migration requires the same `service_role` access used in earlier stages. It grants no access to `anon` or `authenticated` database roles; app routes enforce the existing feature and per-tab permissions.

## Phase plan

- Phase 1 (v395): Generate school-specific Kit label IDs — complete.
- Phase 2 (v396): Create verified packing manifests for each physical school Kit — **this release**.
- Phase 3: Select a school, assemble **only its ready physical Kit labels** into uniquely identified, auditable `SCHOOL-01` cartons; prevent reusing a Kit across active cartons.
- Phase 4: Printable Kit and Carton label templates with ID + QR code; scan opens an authenticated/scoped, read-only contents manifest.
