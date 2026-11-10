# v388 — Production Receiving before Testing

## Deployment (production maintenance window)
1. Backup the database. Ensure v384 tested-only migration (including the legacy failed-unit decision) and v379 documents migration have succeeded. Pause project writes.
2. Run `sql/2026-11-10-preparing-production-intake-v388.sql` in Supabase SQL Editor. It is a single transaction; do not deploy if it fails.
3. Deploy the modified files immediately; resume writes after smoke testing. The new application requires the new RPCs.
4. In Users Center, enable Stage 1 Production Receiving (`preparing.stage.intake`) for the intended users with granular permissions. The old `preparing.stage.production` permission now labels Stage 4 Operations Receiving; no existing grant or closure key is rewritten. Legacy non-granular access follows the existing generic stage-update rule.

## Workflow
Production Receiving → Project Testing → Warehouse Receiving → Operations Receiving → Box Distribution → Project Kit Cartons.

Production intake records cumulative quantities per component, with a delta audit, verified actor, date and reference. Testing can only increase up to intake; intake cannot be corrected below tested quantity. The database serializes both writes using the project lock. The testing and warehouse ledgers, existing handoffs, cartons, and signed closure records remain intact. The new stage has its own closure and signed documents. Progress averages six stages (closed stages override their own quantity progress to 100%).

## Existing projects
The migration seeds an opening intake balance equal to the existing positive net tested quantity, clearly labeled as a migration, not a physical receipt or a named user's work. Untested units previously physically received are not known and must be recorded manually. Existing closures are not automatically copied to the new stage. The existing downstream internal key `production` remains unchanged.

## Verification
Run the new test suite and smoke-test intake 10, test 6, reject test 11, reject intake correction to 5, receive warehouse/operations, close the new stage, and verify six progress bars. SQL has not been executed against the production database by the patch author. One historical Add School source assertion remains failing (unrelated to this change).
