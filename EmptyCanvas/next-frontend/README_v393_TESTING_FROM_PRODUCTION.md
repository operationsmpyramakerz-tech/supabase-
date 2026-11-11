# v393 — Remaining to Test follows Production Receiving

## Behavior
- **Components Testing → Remaining to Test** includes only components whose accumulated Production Receiving quantity is greater than the accumulated tested quantity.
- **Ready to Test = max(0, Production Received − Tested)**. The yellow summary tile and the read-only row metric show that actionable quantity.
- **All Components** continues to show the project's full bill of materials. **Fully Tested** continues to mean the project's full required quantity is tested; project requirements and stage progress are unchanged.
- Production Receiving saves remain in the existing intake ledger, and Testing input is still limited to Production Received by the existing database trigger.
- The same pending-tab membership rule is applied in the server-side edit authorization, preserving granular tab edit permissions.

## Deployment
Replace the files at their original repository paths and deploy the application. **No new SQL or schema change is needed** (assuming the existing v388 Production Receiving migration was applied already).

## Smoke test in Production after deployment
1. Receive 4 units of an untested component in Production Receiving.
2. Open Components Testing → Remaining to Test: it should show that component, with Ready to Test = 4.
3. Test 3: Ready to Test = 1; the component remains in the list.
4. Test 1 more: the component disappears from Remaining to Test, but remains under All Components.
5. Receive 2 more in Production Receiving: it reappears with Ready to Test = 2.
6. With granular permissions enabled, verify a user allowed to edit only Testing → Remaining to Test may save only rows matching the new rule.

Tests: 33 targeted Node tests passed; JS/JSX syntax parsed successfully. No end-to-end Production test or full Next.js build was performed.
