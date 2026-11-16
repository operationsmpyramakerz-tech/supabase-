# ERP Pyramakerz — Next audit logging work by ownership (16 Nov 2026)

## Verified state

- **Verified in production by the user:** the History administrator probe wrote `Verified history audit write` on **16 Nov 2026**. Supabase `operation_history` therefore accepts the current Chat 09 audit payload.
- **Already implemented by Chat 09:** History viewer, diagnostics, and recording of Backup exports, imports, table deletes, and row create/update; History clear now retains an authorized audit marker.
- **NOT implemented:** sign-in/sign-out, Orders, Projects, Events, Expenses, Tasks, KPIs and B2C activity. **No automatic global recording exists** in this snapshot. The fact that History lists earlier logins does not prove new login logging works.

## Required contract for all owners

Use the existing **server-only** helper `lib/history-audit.js` exported as `recordHistoryForAccount`. Don't add client-side audit POST endpoints that accept actor name/ID or action from the request body; those are spoofable. Don't edit Chat 09-owned files or central `lib/supabase-rest.js`, permissions, AppShell, or `server.js`.

After each **successful committed server mutation**, write one record, with `account` and `memberId` from an authenticated server gate/context. Use a stable event key and readable label, a page name, entity type, ID and safe label, and the relevant HTTP method. A request returning 401/403/400 or `ok:false`/`success:false` is NOT a successful action.

```js
import { recordHistoryForAccount } from "../../../../lib/history-audit"; // adjust relative path

// AFTER the real mutation returns successfully:
try {
  await recordHistoryForAccount({
    account: gate.account, memberId: gate.memberId,
    pageName: "YOUR PAGE NAME", pageKey: "your-page",
    actionLabel: "Updated record", actionKey: "yourmodule.record.updated",
    entityType: "record", entityId: String(saved.id || ""),
    entityLabel: String(saved.title || "").slice(0, 220),
    method: "PATCH", path: "/next/api/your-endpoint", statusCode: 200,
  });
} catch (auditError) {
  console.error("AUDIT_WRITE_FAILED", auditError?.code || "WRITE_FAILED", auditError?.message || "Unknown failure");
  // Do not conceal a global logging outage; decide the failure policy for critical actions.
}
```

**Never log** passwords, verification PINs, tokens, authorization headers, cookies, attachments, CSV content, entire request bodies, profile fields, or sensitive forms. For a public unauthenticated form, don't fabricate an employee identity: introduce an explicitly identifiable *public user* event only after the actor model is approved by Chat 01. Deduplicate retries where practical, and make sure there is no fake success event for an action that is rejected or rolled back.

## Prioritized handoffs by Chat — paths verified in the supplied ZIP

| Chat owner | First routes to instrument after successful persistence | Follow-on operations | Notes |
|---|---|---|---|
| **01 — Core** | `app/api/auth/login/route.js`, `app/api/auth/logout/route.js` | `app/api/account/route.js`, `app/api/users-center/**`, permission and profile mutations | **Start here.** Login's `loginDirect()` returns `result.session` and `result.response` but not the account. Chat 01 must safely extend/derive actor from the authenticated login result/session (not supplied credentials) without exposing it to the client. For logout, capture verified session actor **before** `logoutDirect` destroys the session; record after successful logout. Never prevent logout from clearing the session on an audit network failure. |
| **02 — Orders & Inventory** | `app/api/orders/current/mutations-direct/route.js`, `app/api/orders/operations/mutations-direct/route.js`, `app/api/orders/shopping-cart/submit-direct/route.js` | `app/api/orders/current/edit-direct/route.js`, `app/api/orders/current/update-received-direct/route.js`, `app/api/orders/maintenance/mutations-direct/route.js`, `app/api/orders/purchase-requisition/save/route.js`, plus Products, Proposals, Stocktaking, Kits mutations | Confirm the returned result really indicates success; log only completed creates/edits/status/stock changes. Avoid logging sensitive input or entire kits. |
| **03 — Projects Preparing** | `app/api/projects-preparing/route.js`, `app/api/projects-preparing/stages/route.js`, `app/api/projects-preparing/components/route.js` | `app/api/projects-preparing/intake/route.js`, `testing/route.js`, `warehouse/route.js`, `production/route.js`, `project-cartons/route.js`, `stage-closures/route.js`, `closing/route.js` | Use project and school/component IDs from saved results; preserve distinct action names for each stage. Multiple database changes inside one action should produce a business-level summary rather than a flood of fake component events. |
| **04 — Events** | `app/api/events/mutations-direct/route.js` | `app/api/events/route.js`, `app/api/events/[id]/route.js`, `app/api/events/team/route.js`, `app/api/events/components/route.js` | `mutations-direct` dispatches `create-event`, `update-event`, `workflow-transition`, `request-action`, `archive-event`, and component actions; record only after each branch succeeds. |
| **05 — Expenses** | `app/api/expenses/mutations-direct/route.js` | `app/api/expenses/users/route.js`, `app/api/expenses/user/[memberId]/route.js` | Actions present: `cash-in`, `cash-out`, `settle`, `admin-update`, `admin-delete`. Use the authenticated `gate`. Do not log bank credentials, uploaded receipts or the full expense payload. |
| **06 — Tasks** | `app/api/task-management/mutations-direct/route.js` | `app/api/task-management/[id]/route.js` and other mutation endpoints | Actions include `ticket-create`, `ticket-update`, `ticket-delete`, `ticket-mark-delivered`, workflow/assignment/section changes. `directTaskManagementContext()` already returns account + memberId; exclude `people-workflow-get` (read only). |
| **07 — Dashboard & KPIs** | `app/api/kpis/mutations-direct/route.js` | `app/api/kpis/reviews/**`, `app/api/sla-settings/**` if present | `save_standard`, `create_review`, `update_scores` need separate stable keys. `directKpisContext()` includes account and memberId. Don't log every GET/dashboard view by default. |
| **08 — B2C** | `app/api/b2c/mutations-direct/route.js` | `app/api/b2c/forms/**`, `app/api/b2c/databases/**` | Stable events for database/form/record mutations, but avoid capturing customer personal data in labels. `form-submit` may be public: do not attribute it to an arbitrary employee. |
| **09 — Backup & History** | **Already instrumented** | Backups and History clear stay with this chat | Test the real Backup actions from two accounts. |

## Chat 01 — necessary actor detail

`loginDirect()` in `lib/core-auth.js` currently builds a verified `account` and `session` internally and returns `session: {sid, cookieValue, expires}` and a response object. It does *not* return `account`. Chat 01 must design a server-only way to make the verified actor available to its Login route (e.g. return a server-only `auditActor` field not sent in `NextResponse.json(result.response)`), or record the audit in the auth service itself after the session is durably persisted. Don't take the actor from the posted login username because that would not be a verified identity until after authentication.

`logoutDirect()` currently destroys the session; if it is called before reading the account, the actor may no longer be available. Obtain a verified auth-only gate before destroying the session, and only record logout after successful destruction. A logout must still clear the cookie if audit storage is down.

## Verification (two distinct user accounts)

1. User A signs in; user B signs in. Both must get separate, accurately attributed `auth.login` events with current timestamps, not just legacy September entries.
2. User A submits one order; user B updates a different order. Verify `action_key`, `page_name`, `entity_id`, actor ID/name in Supabase History.
3. User A updates a project stage and user B creates an event or task; check that only successful persisted mutations appear.
4. Try an unauthorized action; it must **not** be recorded as successful. Ensure the feature permission remains enforced.
5. Temporarily simulate an audit-write failure in staging. Confirm server logs show it. Decide whether the business mutation should remain successful for the relevant action; never mislead the user.
6. Repeat for each owning group. The original **26 September** logs remain only as historical records; events since then that were never saved cannot be recovered by a refresh.

**Merge safety:** each Chat supplies changed files only and its base revision. Merge one owner branch at a time, test, then rebase remaining owner branches. No cross-owner edits should be smuggled into Chat 09's ZIP.
