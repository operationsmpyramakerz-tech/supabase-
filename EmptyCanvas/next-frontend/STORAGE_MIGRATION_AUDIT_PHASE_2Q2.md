# ERP Phase 2Q2 — Storage Migration Audit (code review, v113)

**Status: code hardening complete; live Storage migration NOT confirmed or performed.**

## Scope confirmed in code

The existing non-destructive migration tooling covers *legacy public object references* only in:

| Scope | Source table(s) | Allowed path prefix |
| --- | --- | --- |
| Task Management | `department_ticket_sections`, `department_ticket_section_assignments` | `task-management/attachments/` |
| B2C | `b2c_customers` | `b2c/customer-files/` |
| KPI Evidence | `kpi_employee_scores` | `kpi-evidence/` |

The private upload switches are per scope (`ERP_STORAGE_TASK_*`, `ERP_STORAGE_B2C_*`, `ERP_STORAGE_KPI_*`). Each scope requires both `*_PRIVATE_UPLOADS_ENABLED=1` and `*_RECORD_AUTH_ENABLED=1`, and an independently configured **non-public** `ERP_STORAGE_PRIVATE_BUCKET`. Do **not** flip switches until the record-link SQL and access checks are deployed and tested.

**Not yet covered by this legacy reference migration:** public URL flows for user/profile images, order/delivery receipts, expense receipts, product pictures and other ERP attachments. Examples can be found in `lib/account-direct.js`, `lib/order-receipts-data.js`, `lib/expenses-data.js`, `lib/order-details-data.js`, and `lib/supabase-rest.js`. Permission-gated *UI access* does not make a public Supabase object private: a person holding its public URL may still retrieve it. These flows require their own reviewed storage inventory and migration before claiming ERP-wide privacy.

## Hardening included in 2Q2

1. Public URL inventory preserves each distinct spelling/variant of the same object's URL (including query parameters), while deduplicating the object that must be copied.
2. The copy planner and reference cutover reject associations that do not point to the **exact original bucket, path and configured Supabase origin**. Foreign hosts, different buckets or paths and non-public URL patterns are rejected.
3. Every cutover operation must produce precisely the approved reference-only replacements from its original value. Changes to quantities, other JSON properties or arbitrary strings are rejected **before** the first database write. Duplicate copied objects are rejected.
4. Errors from Supabase HTTP responses are no longer echoed into migration logs (some error bodies can contain confidential data).
5. Added regression tests for multiple URLs per object, foreign/wrong-bucket links, tampered cutover plans and legitimate mocked apply/verify/rollback.

## Safe runbook (staging first; credentials stay on your own server)

1. Back up the database and Storage. Confirm that `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `ERP_STORAGE_PRIVATE_BUCKET` and the **same** storage signing secret used by the ERP are available on a trusted server. Never share values, private manifests or record data.
2. Inspect bucket privacy and counts in Supabase with **read-only** SQL, e.g.:

   ```sql
   SELECT id, name, public, file_size_limit
   FROM storage.buckets;
   SELECT bucket_id, split_part(name, '/', 1) AS prefix, count(*) AS object_count
   FROM storage.objects
   GROUP BY bucket_id, split_part(name, '/', 1)
   ORDER BY bucket_id, prefix;
   ```

3. Run `npm run security:preflight` using deployment environment variables. Ensure the bucket exists and is **not public**; see `sql/ERP_Phase2N6_Private_Storage_Bucket.sql` (review carefully before manually executing any SQL).
4. Inventory legacy references (read-only for Supabase; writes a confidential **local** JSON manifest):

   ```bash
   node scripts/storage-legacy-migration.mjs audit --out /secure/erp-inventory.json
   ```

   Examine table counts, each object path and associated records. The script covers **only four known tables**; investigate untracked public objects/other ERP tables separately.
5. With approved scope and backup, copy verified objects to the private bucket (writes copies only, no database edits):

   ```bash
   node scripts/storage-legacy-migration.mjs copy --manifest /secure/erp-inventory.json --out /secure/erp-copied.json --execute
   node scripts/storage-legacy-migration.mjs verify --manifest /secure/erp-copied.json
   ```

6. Install and review `sql/ERP_Phase2N5_Task_Storage_Record_Access.sql`, `sql/ERP_Phase2N5B_B2C_KPI_Storage_Record_Access.sql` and `sql/ERP_Phase2N6C_Legacy_Reference_CAS.sql` as required **on staging**, confirming `anon`/`authenticated` cannot invoke the privileged cutover function. Test record authorization for different users and Own/Team/All scopes, including revoked permissions.
7. Create a **reviewable** cutover plan (read-only), review it, then apply **only** with explicit approval:

   ```bash
   node scripts/storage-legacy-reference-cutover.mjs plan --manifest /secure/erp-copied.json --out /secure/erp-plan.json
   # Review plan and independently validate backups + staging permissions before proceeding.
   node scripts/storage-legacy-reference-cutover.mjs apply --plan /secure/erp-plan.json --journal /secure/erp-journal.json --execute
   node scripts/storage-legacy-reference-cutover.mjs verify --plan /secure/erp-plan.json
   ```

   If rollback is necessary, `rollback --plan /secure/erp-plan.json --journal /secure/erp-journal.json --execute` preserves all objects. **Never delete public originals or disable public access until every reference, client, signed URL and permission/revocation test has been verified.** Copying alone does not protect previously public files.

## Remaining / gates to close Phase 2Q2

- Obtain **actual** production/staging bucket metadata, file counts and database-reference inventory; the project ZIP alone contains no live Supabase state.
- Confirm complete coverage of legacy public URL flows not in the four migration tables; decide an explicit migration policy for user avatars, expense receipts, order receipts and product images.
- Test private signed URL expiry, user access revocation, record deletion and cross-user sharing in staging, and confirm that public URLs stop being served only **after** a safe and complete cutover.
- Confirm production build, all storage SQL/RLS configurations, backup-and-rollback exercise and staged rollout. **Do not mark Storage Migration complete solely because code tests pass.**
