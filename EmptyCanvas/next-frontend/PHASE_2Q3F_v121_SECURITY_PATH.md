# Phase 2Q3F — secure search_path / verification adjustment

## Why
The installed RPC and privileges are confirmed in the uploaded CSV, but the old verification expression compared against only the literal `search_path=`. The original installer declared `SET search_path = ''`, which can have a different `proconfig` representation. The new installer uses the explicit `pg_catalog, pg_temp` trusted-schema order and the verifier tests this exact secure ordering.

## Deploy
1. Upload the changed repository files under `sql/` and `tests/` to the matching paths.
2. On staging, run **only** `sql/ERP_Phase2Q3F_Set_Secure_Search_Path.sql` for an already installed RPC. Do not re-run `CREATE FUNCTION` just to change its search path.
3. Run `sql/ERP_Phase2Q3F_Verify_Installation.sql` and confirm `secure_search_path=true`, `service_role_can_execute=true`, `anon_can_execute=false`, `authenticated_can_execute=false`, along with function installed/security_definer and orders table.
4. Test full-order archive, unarchive, and delete (test order only) from ERP, including permission-denied accounts, partial IDs, and concurrent updates.
5. Only then set `ERP_ATOMIC_ORDER_MUTATIONS=enabled` on a staging instance. Deploy to production only after verified backup and testing.

The repair SQL adjusts function metadata only, not order data. This is not a substitute for live RPC or role-based tests.
