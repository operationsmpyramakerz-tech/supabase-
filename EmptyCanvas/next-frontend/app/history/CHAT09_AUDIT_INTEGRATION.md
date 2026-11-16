# Chat 09 — History: audit integration handoff

## Confirmed from this code snapshot

- `lib/history-data.js` reads `operation_history` through the Supabase REST API.
- The original snapshot contains no call that writes `operation_history`. This change adds the writer and hooks it into **Chat 09 Backup** operations only. Older rows are saved data, **not evidence of system-wide ongoing auditing**.
- `lib/history-audit.js` provides a validated **server-only** `recordHistoryForAccount` function, but cannot record unrelated API actions until the owning modules actually call it.
- The History screen now pages through the table, refreshes periodically while visible, and reports old data honestly. It cannot reconstruct events that were never persisted.

## Integration required with other chat owners

Each owner must add server-side integration, after a successful durable business mutation, without modifying Chat 09 files:

| Owner | Minimum integration scope |
| --- | --- |
| Chat 01 (Core) | Sign-in, sign-out, account/user/permission changes, system settings. |
| Chat 02 (Orders) | Order create/modify/approval/delivery, Products, Stocktaking, Shopping Cart, maintenance, PR. |
| Chat 03 (Projects) | Components, receiving, testing, packing, QC, closure. |
| Chat 04 (Events) | Event creation and updates, confirmation and team actions. |
| Chat 05 (Expenses) | Expense create/update/settle. |
| Chat 06 (Tasks) | Task create, edit, assign and complete. |
| Chat 07 (KPIs) | KPI/SLA mutations where applicable. |
| Chat 08 (B2C) | B2C form and record mutations. |
| Chat 09 (Backup) | **Implemented here:** backup export/import/deletion plus backup table row create/update. |

Example to adapt *in the other owner's API route*:

```js
import { recordHistoryForAccount } from "../../lib/history-audit"; // path depends on route

// After the real write succeeds (not after an attempted click):
try {
  await recordHistoryForAccount({
    account: gate.account,
    memberId: gate.memberId,
    pageName: "Operations Orders",
    pageKey: "operations-orders",
    actionLabel: "Updated order",
    actionKey: "order.updated",
    entityType: "order",
    entityId: String(savedOrder.id),
    entityLabel: String(savedOrder.order_number),
    method: "PATCH",
    path: "/next/api/orders/...",
    statusCode: 200,
  });
} catch (auditError) {
  // Decide operational policy: fail the mutation or report an audit-outage.
  console.error("AUDIT_WRITE_FAILED", auditError);
}
```

### Security requirements

1. Actor name, ID and permissions MUST come from the verified server-side session, not a client-supplied payload.
2. No passwords, tokens, private documents, bulk request bodies or full personal profile content in the audit table.
3. Never infer success solely from HTTP method; log the actual finalized result.
4. Full coverage needs integration with every owner. SQL triggers can supplement data change history but lack reliable session actor context with service-role requests.
5. Audit data should be append-only and protected. Restrict full-history deletion to appropriately authorized administrators and review retention requirements.
6. Validate the current production `operation_history` table schema and role privileges before enabling writes. This snapshot cannot confirm its live structure.

### Release verification

- Create/edit/complete one item in each applicable module as two different users.
- Confirm rows appear newest-first in History, with correct actor and page.
- Confirm unauthorized clients cannot spoof audit actors.
- Confirm failures are reported, no sensitive request fields are stored, and older pages can be loaded.
- Verify login and logout from separate accounts, which must be coordinated with Chat 01.

## Chat 09 UI / diagnostic update — 16 November 2026

The History page has a **Test audit write** action for a verified History page administrator (`history.clear` plus page-level `admin`). This explicitly calls:

`POST /next/api/history/diagnostics`

- The endpoint derives the actor from the verified session and writes **one real, clearly labeled diagnostic event** (`history.diagnostic.verified`) to `operation_history`.
- Successful response includes the persisted row ID; History refreshes to display the new record.
- Failure returns a meaningful diagnostic code and a sanitized error for the authorized administrator; the server also logs `HISTORY_AUDIT_DIAGNOSTIC_FAILED`.
- The diagnostic does **not** enable or simulate logging from other modules. Audit collection for Login, Orders, Projects, etc. must be wired at their successful server-side mutation/login endpoints by their respective owners.

### Recommended troubleshooting order

1. Deploy the Chat 09 files; open History as an administrator; press **Test audit write**.
2. If the test fails, inspect the returned error and server logs. Typical causes: wrong Supabase environment, missing column(s), row ID defaults, RLS/service key, invalid column type. Do not run a blind destructive schema migration.
3. In Supabase SQL Editor, inspect the actual table **read-only**:

   ```sql
   select column_name, data_type, is_nullable, column_default
   from information_schema.columns
   where table_schema = 'public' and table_name = 'operation_history'
   order by ordinal_position;

   select count(*) as saved_events, max(created_at) as latest_event
   from public.operation_history;
   ```

4. If the test succeeds, the database can accept this writer's payload. Missing events for other pages are therefore an **integration/coverage issue**, not a History refresh issue. Ask Chat 01 to integrate server-side sign-in/sign-out first, then the other owners for their mutation endpoints.
5. After integration, validate operations with **two different user accounts** and compare actor IDs, actions, page names, timestamps. A test event cannot reconstruct old operations that were not persisted.

### Owner handoff — precise task

> Wire `recordHistoryForAccount` from `lib/history-audit.js` into successful authenticated server-side operations in your own group. Derive `account` and `memberId` from `getDirectAccountGate` (or the existing verified session gate), never from the request body. Save action/page/entity metadata only **after success**, do not include passwords, session tokens, raw request bodies, or private files, and log audit failures visibly to server logs. Do not modify Chat 09 files or central Core files unless they belong to your group. Coordinate shared DB/API contracts before deployment.

**Scope note:** Chat 09 owns the History reader/writer/diagnostics and Backup events. It cannot provide reliable attribution for other groups' backend activity without instrumentation at their real endpoints. Database triggers alone generally cannot recover the current ERP user identity when the backend writes via a service-role key.


## Chat 09 follow-up — 16 November 2026 (after successful live write probe)

The user verified that the test event was written and visible in History on 16 November 2026. This confirms **writing to the live table works for the diagnostic endpoint**. It does NOT confirm any login/order/project endpoint is instrumented.

### Tamper-evident clear event (in Chat 09)

- History `DELETE` now writes a verified administrator `history.cleared` event **before** deleting rows and excludes its ID from the deletion. If the audit write fails, clearing is blocked.
- The client reloads the retained audit event and no longer claims the table has become empty.
- This is a best-effort application-level audit marker, **not** an immutable ledger. A database superuser/service-role or Backup database administration can still erase or alter audit data. Enforce database-level restrictions and retention independently where required.

### What to do next

The next integration step belongs in **Chat 01**, starting with `app/api/auth/login/route.js` and `app/api/auth/logout/route.js`. Then each owning Chat 02–08 must instrument its own successful mutations. See `CHAT09_OTHER_CHATS_AUDIT_TASKS.md` in this directory for verified route paths and tailored work instructions. Do not modify those modules in Chat 09.

**Check after each integration:** perform one successful action using user A and another using user B; History must show the correct actor, action, timestamp, page and entity label. Repeat a failed operation; it must never be logged as a successful action.
