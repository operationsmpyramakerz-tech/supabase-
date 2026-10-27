# ERP — Phase 2Q4A: Multi-user Permission Verification (v122)

**Source:** `supabase--main-122.zip`. **Environment:** Automated policy tests run offline against the uploaded code. No Supabase credentials, live users, order rows, or file objects are accessed.

## Database prerequisite verified by supplied SQL result

The supplied `Supabase Snippet Untitled query 687.csv` shows:

| Verification field | Result |
|---|---|
| `orders_table_exists` | `true` |
| `function_installed` | `true` |
| `security_definer` | `true` |
| `secure_search_path` | `true` |
| `service_role_can_execute` | `true` |
| `anon_can_execute` | `false` |
| `authenticated_can_execute` | `false` |

This establishes **installation/configuration**, not that order mutations have succeeded. **Do not mark Phase 2Q3F live acceptance complete yet.** Do not enable `ERP_ATOMIC_ORDER_MUTATIONS=enabled` on production as part of this package.

## Automated verification — Phase 2Q4A

Run in `EmptyCanvas/next-frontend`:

```bash
npm run security:test-multiuser
```

The new `tests/security-phase2q4a-multiuser-policy.test.mjs` uses actual feature-registry and scope-policy functions to exercise synthetic user profiles, not mocks of the algorithms. It covers permission catalog integrity, explicit Delete grant/deny, parent View denial, Own/Team/All intersections, missing owner IDs, mixed-owner order visibility, task/event ownership, account/notification action isolation, serialization of explicit denials and representative Review Orders API gate ordering.

These are **offline unit/source regression checks**, not end-to-end authorization proof. For staging verification, execute the test matrix below.

## Required Staging verification matrix (record Pass / Fail / Blocked)

Set up **disposable accounts and data on Staging only**. Keep real usernames, passwords, access cookies, service-role keys, and contact details OUT of test reports. Use the Users Center admin UI to record new grants and Team links; verify the change actually persisted. Use orders with multiple components and separate owners. Keep a database backup before destructive cases.

| ID | Test profile / context | Expected behavior | Result |
|---|---|---|---|
| S01 | Signed out; open My Orders and request its API | Authentication required; no data exposed | Pending |
| S02 | Advanced user; `orders.operations.view` explicitly denied | Operations page denied AND list API denied | Pending |
| S03 | `orders.operations.view` allowed; `orders.operations.delete` explicitly denied | Delete hidden, POST mutation returns 403; no rows changed | Pending |
| S04 | `orders.operations.edit` allowed; Delete absent | Delete remains blocked (must not inherit Edit) | Pending |
| S05 | Delete granted Own; target user-owned order | Action allowed only for that person's own complete order, with the existing password/other checks | Pending |
| S06 | Delete granted Own; target belongs to colleague | API denied; other order remains unchanged | Pending |
| S07 | Delete granted Team; target from explicitly linked employee | Authorized subject to normal business checks | Pending |
| S08 | Delete granted Team; target not in team links | API denied; no mutation | Pending |
| S09 | View Own + action All; target colleague's order | Effective scope is Own; request denied | Pending |
| S10 | View All + action Own; target colleague's order | Effective scope is Own; request denied | Pending |
| S11 | View All + action All; disposable third-party order | Authorized where no separate restriction applies | Pending |
| S12 | Mixed owner IDs / incomplete component IDs in same order | Archive, Unarchive, Delete all rejected; no partial mutation | Pending |
| S13 | `orders.my.__enforced` and `orders.my.__scoped` enabled; view denied, delete allowed | My Orders Delete denied | Pending |
| S14 | Task Management Own; target colleague task or assignee | Disallowed data/action inaccessible through UI **and** API | Pending |
| S15 | Event Requests Team; target outside explicit team links | Denied, including direct detail or edit request | Pending |
| S16 | Account View off / Avatar on; Notifications View off / Preferences on | Child actions blocked even when independently granted | Pending |
| S17 | Revoke a user's active grant from a separate admin session; retry previous API request | Fresh request denies; old tab cannot continue mutation | Pending |
| S18 | RPC flag **enabled only on Staging**; Archive complete disposable multi-row order, then Unarchive | Every component changes together; no partial status | Pending |
| S19 | RPC flag **enabled only on Staging**; Delete complete disposable order | All expected components deleted together; verify backups first | Pending |
| S20 | RPC flag **enabled only on Staging**; edit quantities/ownership between load and action | Stale snapshot rejected, refresh required; no partial mutation | Pending |
| S21 | Concurrent order write and RPC on disposable data | Mutation either commits fully or rolls back; monitor 5-second lock timeout | Pending |
| S22 | RPC flag enabled in Staging while RPC deliberately unavailable in a disposable test database | Fails closed; no fallback to legacy writes | Pending |

### Running the live checks safely

1. Confirm the Staging **app, Supabase database, Storage, session secret, and Service Role** are separate from production. Running these on production is **not** an acceptable substitute.
2. Verify the RPC installation on **Staging** with the read-only `sql/ERP_Phase2Q3F_Verify_Installation.sql` query. Its seven boolean result columns should match the verified values above.
3. Deploy code to Staging, set `ERP_ATOMIC_ORDER_MUTATIONS=enabled` there ONLY, and run `npm run security:preflight` with staging environment variables. Restart all staging app instances.
4. Complete S01–S17 with at least four test users (denied, Own, Team, All). For denied cases, replay the same action through browser DevTools Network to confirm **HTTP 403/401** or an intentionally indistinguishable 404. A hidden button alone is NOT a pass.
5. Complete S18–S22 only with disposable Staging orders. Verify DB rows after every mutation and restore Staging test data as needed. Capture timings and PostgreSQL logs for lock failures, but never credentials.
6. Before production rollout, confirm maintenance windows, verified DB backup/restore, a rollback plan, alerting, and approval to enable the flag on **all** instances at once.

### Accepted results / blockers

- **Pass** means actual server responses and database state match the expectation, including after a hard refresh and a second account login.
- **Fail** means any unauthorized response succeeds, cross-user data is returned, or even one row changes on an action expected to roll back. Block the release and retain evidence with secrets redacted.
- **Blocked** means Staging, test identities, data or permissions were not available; do **not** substitute the offline tests for Staging acceptance.

## Remaining release gates

- **2Q3F:** real Staging atomic Archive/Unarchive/Delete and concurrent-write tests still pending.
- **2Q4:** real multi-account tests S01–S22 pending; this deliverable covers only offline regression and the test plan.
- **2Q2 live:** storage migration, bucket policies and legacy public links need confirmation.
- **2Q5:** full Production Build, E2E deployment, staging preflight and log/performance review.
- Separately: plaintext password migration and identity-based Admin trust should be planned as explicit security projects.
