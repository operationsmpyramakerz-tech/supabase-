-- Read-only. Export the results and back up the database before the destructive migration.
-- Review failed units, incomplete intake and any historical warehouse mismatch.
WITH tested AS (
 SELECT project_id,item_id,sum(passed_delta)::bigint AS passed,sum(failed_delta)::bigint AS failed,sum(received_delta)::bigint AS intake_delta
 FROM public.erp_preparing_project_test_lines GROUP BY project_id,item_id
), received AS (
 SELECT project_id,item_id,sum(accepted_delta)::bigint AS accepted FROM public.erp_preparing_warehouse_receipt_lines GROUP BY project_id,item_id
)
SELECT i.project_id,i.id AS item_id,i.product_name,
 coalesce(t.passed,0) AS legacy_passed,coalesce(t.failed,0) AS legacy_failed,
 coalesce(t.passed,0)+coalesce(t.failed,0) AS tested_if_include,
 coalesce(t.passed,0) AS tested_if_exclude,
 coalesce(l.intake_qty,0)+coalesce(t.intake_delta,0) AS legacy_testing_received,
 coalesce(r.accepted,0) AS warehouse_received
FROM public.erp_preparing_warehouse_items i
LEFT JOIN tested t ON t.project_id=i.project_id AND t.item_id=i.id
LEFT JOIN received r ON r.project_id=i.project_id AND r.item_id=i.id
LEFT JOIN public.erp_preparing_project_test_legacy_intake l ON l.item_id=i.id
WHERE coalesce(t.failed,0)<>0 OR coalesce(l.intake_qty,0)+coalesce(t.intake_delta,0)<>coalesce(t.passed,0)+coalesce(t.failed,0)
 OR coalesce(r.accepted,0)>coalesce(t.passed,0)
ORDER BY i.project_id,i.product_name;
