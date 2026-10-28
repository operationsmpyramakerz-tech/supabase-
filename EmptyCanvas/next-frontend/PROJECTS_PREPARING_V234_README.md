# Projects Preparing v234 — Auto School QC + Project Total Required

Base: `supabase--main-233.zip`

## Behavior

- `Add Schools` continues to inherit the project's Proposal, but now performs **one atomic Supabase RPC** that creates all new school folders, their QC manifests and item rows, and their warehouse allocation-demand rows together.
- Components are copied from the **current project Master BOM** (including any per-Kit manual adjustments). School manifests are frozen snapshots once created: later edits to Project Components do not silently rewrite existing school QC data.
- This operation does **not** receive, allocate, dispatch, or mark stock prepared. All receiving and delivery remain separate.
- Project Components: `Kit Qty / School` is the per-school BOM value. `Total Required` is `Kit Qty / School × number of beneficiary schools` for that Kit. The project summary and Warehouse Receiving's Required amount use the same formula. Accepted, damaged, and allocated quantities remain actual transactions and are never multiplied.
- The existing `warehouse_items.required_qty` and each Kit's `source_kits.quantity` are kept as **per-school master quantities**, consistent with the current SQL Kit-sum constraint. Project-wide requirement is calculated at read time, avoiding destructive conversion of previously recorded stock.
- Because school QC is snapshotted, if you edit project BOM **after schools are added**, review and reconcile those existing school manifests separately before final delivery. New schools receive the latest BOM. This release does not retroactively rewrite existing school snapshots.
- Existing schools without a QC manifest are left unchanged to protect their current stages, receipts, and historical data; they can still use the existing one-time Capture button if needed.

## Install (production)

1. Back up PostgreSQL/Supabase, and keep the current working code package.
2. In SQL Editor, run `sql/2026-10-28-preparing-school-auto-components-v234.sql` **once** after applying v233 and all earlier migrations.
3. Upload the changed files ZIP to GitHub under their original paths. Deploy only after SQL reports success.
4. Test with a disposable project with a Kit containing 2 motors per school: add 2 schools, verify QC manifests immediately show 2 motors each, Project Components `Total Required` shows 4, and Warehouse Receiving shows Required 4, Accepted 0. Add a third school: Total Required becomes 6. Verify no duplicate manifests and no stock receipt was created.
5. Verify a deliberate duplicate school or stale BOM cannot be added and does not leave partially created school data.

## Verification

- `node --test tests/projects-preparing-*.test.mjs`
- JS/JSX parsed by TypeScript compiler API.
- SQL migration checked statically for balanced dollar quotes/transaction. Not executed against live PostgreSQL, and no complete application build performed (dependency folder not included).

## Scope and limitations

- No code deploy, SQL execution, or production data changes were performed here.
- No new permissions: `preparing.manage` for Add Schools, `preparing.view` to read components.
- The SQL RPC is restricted to service-role execution and runs in a single DB transaction.
