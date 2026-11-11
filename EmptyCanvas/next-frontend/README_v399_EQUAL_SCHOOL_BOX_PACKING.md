# v399 — Equal School Box Packing (production deployment)

## Goal
Box Distribution packing is now school-first, not individual-box-first.
Within a component's Kit Group, select one or several schools (or **Select All Schools**), specify the **total packed quantity for each school**, and click **Save & Distribute** once. The backend splits each school's total by the number of its active generated Kit labels and applies the **same whole-number packed quantity to each one** in one SQL transaction.

Example: City has 5 `ADD` Kit labels, with 10 components requested in the captured Proposal. Enter `10` as the school total; every Kit receives 2. Enter `5`; every Kit receives 1. Enter `6`; the system refuses (fractional distribution). Enter `15`; refused because the school requested 10. When selecting City + another school, each school has its own total and its own box count; a failure in either school rolls back **all schools**.

## Critical production deployment order

1. Back up the current Supabase database and verify v395–v398 migrations are already present. **Do not run this migration on an older schema.**
2. Run `sql/2026-11-11-preparing-equal-school-packing-v399.sql` in the self-hosted Supabase SQL Editor as an authorized administrator. It creates `erp_preparing_pack_school_boxes_v399`; no rows are migrated, deleted, or otherwise silently changed.
3. Deploy the updated files in this archive to the repository, keeping their paths. `app/projects-preparing/page.jsx` refreshes the stylesheet cache to v399. No additional npm dependency or environment variable is needed.
4. With a controlled test project, use Box Distribution → Available to Pack → Edit under a component in its Kit Group. Select a school or Select All, review each school total and the per-Box preview, then Save & Distribute. Inspect every generated label in Boxes Label, and confirm its packed quantity is identical for that component.
5. Confirm School Cartons, QR, History, and Mark Kit as Packed continue functioning. Marking a Kit as Packed remains a separate verification step, never automatic merely because one component was distributed.

## What is checked server-side

- User must already have Box Distribution stage write access and edit permission for the active tab; no client-supplied school/box identity is trusted.
- The selected school belongs to the project, and each selected component belongs to that school's captured Proposal and the selected Kit Group.
- Generated school labels must exist and must all still be Draft. Completed labels are locked.
- **Every component** in the school Kit Group must have an integer BOM quantity divisible by the number of generated labels; no rounding, remainder assignment, or phantom/zero-quantity kit contents are allowed.
- The desired total for each school cannot exceed its captured Proposal quantity and must split evenly into whole numbers for the school's label count.
- Existing packed contents are retained; a formerly uneven required plan may be normalized only when existing physical packed counts fit the equal per-Box targets. Unexpected/mismatched contents are rejected, not deleted.
- Across all selected schools, the net new quantity cannot exceed the project's Operations Received stock remaining after other active packed quantities.
- One privileged database RPC locks the project, validates the whole request, then writes the manifest and packed lines in one transaction; errors leave all schools unchanged. Each actual changed line is still audited by the existing v249 pack routine.
- The old single-label packing endpoint is rejected for generated school Kits, and the old manual plan-init/target-transfer actions are blocked at the HTTP API to avoid reintroducing unequal contents.

## Existing data and unavoidable conflicts

- Older v396 packing plans may have uneven expected contents because the previous logic distributed remainders to the first label. v399 can rebalance **uncompleted** group targets safely when already-packed physical quantities are not above the new equal per-Box target. It does not silently unpack/repack physical contents or modify completed Kits.
- If a school requested 5 of a group component but has 2 Kit labels, no all-identical integer packing plan exists. The system blocks this school and explains why. Correct the school's Proposal/label count through an appropriately controlled project data process **before** packing. Kit-label counts are locked after planning; this release does not add unsafe automatic label removal/reset.
- Packing a requested quantity of zero is a deliberate removal of previously recorded draft quantities for the selected school component. Staff must physically verify changes. Fully packed Kits cannot be edited.
- This release does not modify existing Kit QR URLs, outer Cartons, approved/packed Kit contents, school identities, or historical packing audits.

## Verification limitations

Node tests and TypeScript JSX syntax parsing can be run offline. No direct Supabase connection, live SQL execution, full Next.js build or Production browser validation was available in the authoring environment. Test at least one small school/group after deployment before processing all schools.
