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
