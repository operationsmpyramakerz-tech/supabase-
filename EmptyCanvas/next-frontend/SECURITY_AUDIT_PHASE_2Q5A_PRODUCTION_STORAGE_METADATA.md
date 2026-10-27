# Phase 2Q5A — Production-only Storage metadata audit (ERP v209)

## Why now

Phase 2Q4D authenticated Own/Team/All checks require *four existing authorized accounts* and *three verified real order-number fixtures*. Those inputs have **not** been supplied or verified, so **no live authenticated permission test was performed**. The SQL/read-only Storage metadata review can proceed independently on the single production environment, without Staging.

## Supabase SQL Editor workflow (read-only)

1. From an administrator account, open the existing Production Supabase SQL Editor. Confirm that you are in the expected database (do not run on an unknown instance).
2. Copy **only** `sql/ERP_Phase2Q5A_Production_Storage_Metadata_Readonly.sql` into a new query, and run it. The query reads `storage.buckets` and PostgreSQL catalogs (`pg_class`, `pg_namespace`, `pg_policies`); it does **not** write or inspect individual objects.
3. Review the columns `section`, `item`, `observed`, `finding`, `action`. A bucket marked `REVIEW` is **not necessarily a vulnerability**: product images may be intentionally public. An intended private bucket must display `public=false`.
4. Compare the private bucket name in the report **locally** against the server's `ERP_STORAGE_PRIVATE_BUCKET` value; do not disclose secret keys or credentials.
5. Record *only* the summary of public/private buckets and RLS/policy status for the audit. Avoid sharing employee data, public file URLs, tokens, policy predicates or signing keys.

**What this does not verify:** private object contents; Storage RLS *effectiveness*; file reference ownership; signed URL expiry; whether public URL references for receipts, profile pictures, tasks, B2C or KPI have been migrated; or rollback and recoverability. Do not disable public buckets, move files, or run the legacy migration scripts based on this snapshot. These require a separate approved, backup-backed plan.

## Offline 2Q4D configuration preparation improvement

To avoid confusion with the preceding screenshots, `--check-config` now validates the approved URL plus *three numeric order references* locally **without requiring consent or cookies**. No network requests are made. The full authenticated test **still requires** `ERP_PROD_SCOPE_CONSENT=I_CONFIRM_AUTHENTICATED_PRODUCTION_GET_ONLY` and four distinct explicitly authorized sessions.

```bash
cd EmptyCanvas/next-frontend
export ERP_PROD_SCOPE_BASE_URL='https://operation.propyramakerz.com/next'
export ERP_PROD_SCOPE_EXPECTED_HOSTNAME='operation.propyramakerz.com'
# Fill with EXISTING and appropriately owned order numbers; the examples below are placeholders only.
export ERP_PROD_SCOPE_ORDER_OWN='11'
export ERP_PROD_SCOPE_ORDER_TEAM='22'
export ERP_PROD_SCOPE_ORDER_OUTSIDE='33'
npm run security:production-auth-scope -- --check-config
```

**Config PASS does not establish that these numbers exist or have suitable ownership.** No live authenticated probe is run without independent authorization of the four account sessions and validation of the actual fixture relationships. Never commit cookies or paste tokens in chat. `ERP_ATOMIC_ORDER_MUTATIONS` must remain disabled on Production until an approved, controlled functional test can be conducted safely; this phase does not enable it.

## Open security gates after Phase 2Q5A

- 2Q4D: Live authenticated Own/Team/All matrix not run (fixtures and consent missing).
- 2Q3F: Atomic RPC installed and signature/search_path verified in previous operator report, but archive/delete behavior under concurrency not live-tested. Do not use live orders for destructive tests.
- 2Q2: Storage metadata snapshot and migration status not independently verified until the operator runs the SQL; other public URL flows remain outside current migration coverage.
- 2Q5: Production backup/restore checks, build, storage cross-user read tests and complete API/permissions review remain outstanding.

**No Production API route, database row, bucket, SQL function, permission, env value or user record is changed by these files.**
