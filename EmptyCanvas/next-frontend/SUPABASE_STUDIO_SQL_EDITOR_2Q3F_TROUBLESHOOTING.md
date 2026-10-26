# Phase 2Q3F — Self-hosted Supabase Studio SQL Editor error (v120)

## What the error does and does not prove

The error `Invalid input: expected string, received undefined`, with paths
`code` and/or `formattedError`, is a Supabase Studio response-validation
error reported for some self-hosted Studio releases. **It does not confirm
whether the migration SQL ran.** It may occur even for `SELECT 1`.

Do not paste the migration again blindly, and do not enable
`ERP_ATOMIC_ORDER_MUTATIONS` while the function's existence and privileges
are unknown.

## Check without altering data

1. In the **Staging** project's SQL Editor, run only:

   ```sql
   SELECT 1 AS sql_editor_ok;
   ```

   If the same validation error appears, diagnose the self-hosted Studio/API
   rather than changing the `erp_atomic_order_action` function. Review Studio
   container logs, its DB connectivity settings (for example the correct
   `POSTGRES_HOST` and `POSTGRES_PORT` for your Compose network), and the
   Studio image version. Use an image known to be compatible with your
   deployment; do not change database volumes or credentials to troubleshoot.

2. Once queries work, run `sql/ERP_Phase2Q3F_Verify_Installation.sql`
   (read-only). Interpret these columns:

   - `orders_table_exists`, `function_installed`, `security_definer`,
     `empty_search_path`, `service_role_can_execute`: **true**.
   - `anon_can_execute`, `authenticated_can_execute`: **false**.

3. If `function_installed` is false, back up **Staging**, confirm that
   `public.orders` has the expected schema, then run
   `sql/ERP_Phase2Q3F_Atomic_Order_Actions.sql` in Staging **once** using
   a privileged database role. Run the read-only verification query again.
   If the function is already present, do **not** assume its logic is correct
   solely from the name: compare its deployed definition to the reviewed SQL
   before enabling the feature.

4. Only after Staging end-to-end tests (including concurrent Archive /
   Unarchive / Delete and disallowed user scope cases) may you enable
   `ERP_ATOMIC_ORDER_MUTATIONS=enabled` for the Staging application.
   Follow `SECURITY_AUDIT_PHASE_2Q3F.md` for rollout/rollback guidance.

If Supabase Studio cannot run even `SELECT 1`, a DBA can perform the **same
read-only verification** using a secure `psql` connection to the Staging DB.
Do not share DB connection strings, keys, or passwords.

References:
- https://github.com/supabase/supabase/issues/39593
- https://github.com/supabase/supabase/issues/41698
- https://github.com/orgs/supabase/discussions/41752
