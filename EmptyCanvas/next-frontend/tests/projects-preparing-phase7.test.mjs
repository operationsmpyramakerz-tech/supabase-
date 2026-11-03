import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const sql=read('sql/2026-10-27-preparing-project-cartons-phase7.sql');
const api=read('app/api/projects-preparing/project-cartons/route.js');
const service=read('lib/preparing-project-cartons.js');
const client=read('components/preparing/ProjectKitCartons.jsx');
const schoolDelivery=read('components/preparing/PackingDelivery.jsx');
const baseShipmentService=read('lib/preparing-service.js');
const clientEntry=read('components/preparing/PreparingClient.jsx');
const phase5=read('sql/2026-10-27-preparing-final-closing-phase5.sql');

test('additive migration is atomic with no legacy shipment backfill',()=>{
  assert.match(sql,/^BEGIN;/m); assert.match(sql,/^COMMIT;/m);
  assert.doesNotMatch(sql,/DELETE FROM public\.erp_preparing_shipments\b/i);
  assert.doesNotMatch(sql.split('CREATE OR REPLACE FUNCTION')[0],/UPDATE public\.erp_preparing_shipments/i);
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE TABLE/i);
});
test('project pool has unique carton labels and kit names',()=>{
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.erp_preparing_project_cartons/);
  assert.match(sql,/UNIQUE\(project_id,carton_label\)/);
  assert.match(sql,/kit_name text NOT NULL/);
});
test('RLS is on and direct roles have no table privileges',()=>{
  for(const t of ['erp_preparing_project_cartons','erp_preparing_project_carton_lines','erp_preparing_project_allocations','erp_preparing_project_carton_audit'])
    assert.match(sql,new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
  assert.match(sql,/FROM PUBLIC,anon,authenticated;/);
});
test('RPC locks project and school before allocation with both inventory and school quantity gates',()=>{
  const fn=sql.split('CREATE OR REPLACE FUNCTION public.erp_preparing_allocate_project_carton(')[1].split('END; $$;')[0];
  assert.match(fn,/erp_preparing_projects WHERE id=p_project_id FOR UPDATE/);
  assert.match(fn,/erp_preparing_schools WHERE id=p_school_id AND project_id=p_project_id FOR UPDATE/);
  assert.match(fn,/allocated\+p_quantity>pool_line\.packed_qty/);
  assert.match(fn,/previously_packed\+p_quantity>item\.prepared_qty/);
  assert.match(fn,/stage_key='preparing' AND status='completed'/);
  assert.match(fn,/stage_key IN \('packing','delivery','delivery_closing'/);
  assert.match(fn,/INSERT INTO public\.erp_preparing_shipments/);
  assert.match(fn,/INSERT INTO public\.erp_preparing_shipment_lines/);
});
test('same physical carton uses one school batch for its many components',()=>{
  assert.match(sql,/SELECT a.shipment_id INTO shipment_id/);
  assert.match(sql,/WHERE a.project_id=p_project_id AND a.carton_id=carton.id AND a.school_id=p_school_id/);
  assert.match(sql,/UPDATE public.erp_preparing_shipments SET updated_by_id=p_member_id,updated_at=clock_timestamp\(\)/);
  assert.match(sql,/UNIQUE\(shipment_id,component_id\)/);
});
test('project carton packing is bounded by captured project BOM demand',()=>{
  assert.match(sql,/project_demand bigint; packed_elsewhere bigint/);
  assert.match(sql,/packed_elsewhere\+p_quantity>project_demand/);
});
test('legacy school carton quantity changes and cancellation are guarded for pool-linked rows',()=>{
  assert.match(sql,/trg_erp_prep_guard_pool_lines/);
  assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(sql,/trg_erp_prep_guard_pool_shipment/);
  assert.match(sql,/NEW\.status='cancelled'/);
  assert.match(schoolDelivery,/projectLinked&&<p/);
  assert.match(schoolDelivery,/!projectLinked&&!replacementLinked&&<>/);
  assert.match(baseShipmentService,/projectAllocationShipmentIds/);
});
test('reversal only allowed on undispatched school batch and removes shipment packing lines',()=>{
  const fn=sql.split('CREATE OR REPLACE FUNCTION public.erp_preparing_reverse_project_allocation(')[1].split('END; $$;')[0];
  assert.match(fn,/shipment\.status<>'draft'/);
  assert.match(fn,/DELETE FROM public\.erp_preparing_shipment_lines/);
  assert.match(fn,/status='reversed'/);
  assert.match(fn,/status='cancelled'/);
});
test('old stage 4-6 gates still read school shipment tables',()=>{
  assert.match(phase5,/current_position=4/);
  assert.match(phase5,/current_position=5/);
  assert.match(phase5,/current_position=6/);
  assert.match(phase5,/erp_preparing_shipment_lines/);
  assert.match(phase5,/erp_preparing_shipments/);
});
test('both project carton routes use page access and feature-level write permissions',()=>{
  assert.match(api,/getDirectAccountGate\(\["Projects Preparing"\]\)/);
  assert.match(api,/gate\("view"\)/);
  assert.match(api,/preparingStage(?:Gate|Allowed)/);
  assert.match(service,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(service,/requireService\(\)/);
});
test('project UI is accessible inside the project folder not school',()=>{
  assert.match(clientEntry,/project && !school && showProjectCartons/);
  assert.match(clientEntry,/ProjectKitCartons/);
  assert.match(client,/Allocate to School/);
  assert.match(client,/Seal & Ready/);
  assert.match(client,/Reverse if Draft/);
});
test('signed school receipt remains within existing delivery module',()=>{
  assert.match(schoolDelivery,/Confirm School Receipt/);
  assert.match(schoolDelivery,/dispatch/);
  assert.match(sql,/erp_preparing_shipping_audit/);
});
