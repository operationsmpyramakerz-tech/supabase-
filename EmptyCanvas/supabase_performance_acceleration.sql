-- Operations Hub / ERP performance acceleration pack
-- Safe to run more than once in the Supabase SQL editor.
-- It only creates an index when both the table and every referenced column exist.
-- Missing legacy/custom tables are skipped with NOTICE messages instead of failing the script.

create or replace function public.erp_create_index_if_columns(
  p_table text,
  p_index text,
  p_columns text[],
  p_desc boolean[] default null
)
returns void
language plpgsql
as $$
declare
  v_table regclass;
  v_column text;
  v_columns_sql text;
  v_desc boolean[] := coalesce(p_desc, array[]::boolean[]);
begin
  v_table := to_regclass(format('public.%I', p_table));
  if v_table is null then
    raise notice 'Skipping index %: table public.% does not exist', p_index, p_table;
    return;
  end if;

  foreach v_column in array p_columns loop
    if not exists (
      select 1
      from pg_attribute
      where attrelid = v_table
        and attname = v_column
        and attnum > 0
        and not attisdropped
    ) then
      raise notice 'Skipping index %: public.% is missing column %', p_index, p_table, v_column;
      return;
    end if;
  end loop;

  select string_agg(
    format('%I%s', c.column_name, case when coalesce(v_desc[c.ordinality::int], false) then ' DESC' else '' end),
    ', ' order by c.ordinality
  )
  into v_columns_sql
  from unnest(p_columns) with ordinality as c(column_name, ordinality);

  execute format('create index if not exists %I on %s (%s)', p_index, v_table, v_columns_sql);
end;
$$;

-- Orders: keyset pagination, user visibility, tabs/status and review/operations filters.
select public.erp_create_index_if_columns('orders', 'idx_erp_orders_order_number', array['order_number'], array[true]);
select public.erp_create_index_if_columns('orders', 'idx_erp_orders_member_order', array['team_member_id','order_number'], array[false,true]);
select public.erp_create_index_if_columns('orders', 'idx_erp_orders_member_name_order', array['team_member_name','order_number'], array[false,true]);
select public.erp_create_index_if_columns('orders', 'idx_erp_orders_status_order', array['status','order_number'], array[false,true]);
select public.erp_create_index_if_columns('orders', 'idx_erp_orders_sv_approval_order', array['sv_approval','order_number'], array[false,true]);
select public.erp_create_index_if_columns('orders', 'idx_erp_orders_type_order', array['order_type','order_number'], array[false,true]);
select public.erp_create_index_if_columns('orders', 'idx_erp_orders_created_order', array['notion_created_time','order_number'], array[true,true]);

-- Auth / Users Center: the direct auth gate now resolves one member and that member's access rows.
select public.erp_create_index_if_columns('team_members', 'idx_erp_team_members_name', array['name']);
select public.erp_create_index_if_columns('team_members', 'idx_erp_team_members_employee_code', array['employee_code']);
select public.erp_create_index_if_columns('team_member_page_access', 'idx_erp_page_access_member_page', array['team_member_id','page_id']);
select public.erp_create_index_if_columns('app_pages', 'idx_erp_app_pages_sort', array['sort_order']);
select public.erp_create_index_if_columns('team_member_sv_schools', 'idx_erp_sv_access_member', array['team_member_id']);
select public.erp_create_index_if_columns('team_member_signup_requests', 'idx_erp_signup_status_created', array['status','created_at'], array[false,true]);

-- Notifications / history.
select public.erp_create_index_if_columns('notifications', 'idx_erp_notifications_user_ts', array['user_id','ts'], array[false,true]);
select public.erp_create_index_if_columns('notifications', 'idx_erp_notifications_user_notification', array['user_id','notification_id']);
select public.erp_create_index_if_columns('notifications', 'idx_erp_notifications_user_read', array['user_id','read']);
select public.erp_create_index_if_columns('operation_history', 'idx_erp_history_created_id', array['created_at','id'], array[true,true]);

-- Expenses: current-user history, users summary fallback, dropdowns and date ordering.
select public.erp_create_index_if_columns('expenses', 'idx_erp_expenses_user_date', array['user_id','expense_date'], array[false,true]);
select public.erp_create_index_if_columns('expenses', 'idx_erp_expenses_member_date', array['team_member_name','expense_date'], array[false,true]);
select public.erp_create_index_if_columns('expenses', 'idx_erp_expenses_member_raw_date', array['team_member_raw','expense_date'], array[false,true]);
select public.erp_create_index_if_columns('expenses', 'idx_erp_expenses_funds_type', array['funds_type']);
select public.erp_create_index_if_columns('expenses', 'idx_erp_expenses_created_id', array['notion_created_time','id'], array[true,true]);

-- Task Management: list -> sections -> edges/assignments drill-down.
select public.erp_create_index_if_columns('department_tickets', 'idx_erp_tickets_created_id', array['created_at','id'], array[true,true]);
select public.erp_create_index_if_columns('department_ticket_sections', 'idx_erp_sections_ticket_sort', array['ticket_id','sort_order','id']);
select public.erp_create_index_if_columns('department_ticket_section_edges', 'idx_erp_edges_ticket_id', array['ticket_id','id']);
select public.erp_create_index_if_columns('department_ticket_section_assignments', 'idx_erp_assignments_assignee_id', array['assignee_id','id']);
select public.erp_create_index_if_columns('department_ticket_section_assignments', 'idx_erp_assignments_section_id', array['section_id','id']);

-- Events: compact list ordering/status and component catalogue.
select public.erp_create_index_if_columns('events', 'idx_erp_events_created_code', array['created_at','event_code'], array[true,true]);
select public.erp_create_index_if_columns('events', 'idx_erp_events_status_created', array['status','created_at'], array[false,true]);
select public.erp_create_index_if_columns('events', 'idx_erp_events_start_date', array['event_start_date']);
select public.erp_create_index_if_columns('event_components', 'idx_erp_event_components_active_name', array['is_active','name'], array[true,false]);
select public.erp_create_index_if_columns('event_type_catalog', 'idx_erp_event_types_active_created', array['is_active','created_at'], array[true,false]);
select public.erp_create_index_if_columns('event_component_category_catalog', 'idx_erp_event_categories_active_created', array['is_active','created_at'], array[true,false]);

-- B2C: every workspace lookup is scoped by database/form before sorting.
select public.erp_create_index_if_columns('b2c_customer_fields', 'idx_erp_b2c_fields_database_sort', array['database_id','sort_order','id']);
select public.erp_create_index_if_columns('b2c_customers', 'idx_erp_b2c_customers_database_created', array['database_id','created_at','id'], array[false,true,true]);
select public.erp_create_index_if_columns('b2c_forms', 'idx_erp_b2c_forms_database_default_created', array['database_id','is_default','created_at','id'], array[false,true,false,false]);
select public.erp_create_index_if_columns('b2c_form_fields', 'idx_erp_b2c_form_fields_form_sort', array['form_id','sort_order','id']);

-- Proposals / Kits: compact headers + lazy item details.
select public.erp_create_index_if_columns('product_proposal_items', 'idx_erp_proposal_items_proposal', array['proposal_id','id']);
select public.erp_create_index_if_columns('product_kit_items', 'idx_erp_kit_items_kit', array['kit_id','id']);
select public.erp_create_index_if_columns('product_kits', 'idx_erp_kits_folder_created', array['folder_id','created_at','id'], array[false,true,true]);
select public.erp_create_index_if_columns('product_proposals', 'idx_erp_proposals_created_id', array['created_at','id'], array[true,true]);


-- ---------------------------------------------------------------------------
-- RPC acceleration layer
-- ---------------------------------------------------------------------------
-- These functions are the database fast paths already consumed by the Next.js
-- frontend. They intentionally keep the application's existing REST/legacy
-- fallbacks untouched. The functions use canonical ERP table names; if a
-- canonical table is missing, the function raises a clear error so the caller
-- can use its compatibility path instead of returning misleading empty data.

create or replace function public.erp_try_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return replace(btrim(p_value), ',', '')::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.erp_try_timestamptz(p_value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.erp_canonical_token(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(p_value, '')), '[^[:alnum:]]+', '', 'g');
$$;

-- Existing accelerator functions may come from an older ERP migration with a
-- different RETURNS TABLE shape. PostgreSQL cannot change a function return type
-- with CREATE OR REPLACE, so remove only the known accelerator signatures first.
-- They are recreated immediately below and their EXECUTE grants are restored later.
drop function if exists public.erp_order_candidate_numbers(jsonb);
drop function if exists public.erp_order_summary_bundle(jsonb);
drop function if exists public.erp_order_summary_rows(jsonb);
drop function if exists public.erp_home_order_groups(jsonb);
drop function if exists public.erp_home_stock_summary(jsonb);
drop function if exists public.erp_home_expenses_summary(jsonb);
drop function if exists public.erp_stocktaking_folder_summaries();
drop function if exists public.erp_product_proposal_headers();
drop function if exists public.erp_product_kit_headers();
drop function if exists public.erp_expense_order_options();
drop function if exists public.erp_expense_type_options();
drop function if exists public.erp_expense_users_summary();
drop function if exists public.erp_performance_acceleration_status();

create or replace function public.erp_order_candidate_numbers(
  p_options jsonb default '{}'::jsonb
)
returns table(order_number numeric)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table regclass := to_regclass('public.orders');
begin
  if coalesce(lower(p_options->>'context'), '') = '__probe__'
     or coalesce((p_options->>'probe')::boolean, false) then
    return;
  end if;
  if v_table is null then
    raise exception 'ERP accelerator requires public.orders';
  end if;

  return query execute format($sql$
    with src as (
      select to_jsonb(o) as j
      from %s o
    ), filtered as (
      select public.erp_try_numeric(j->>'order_number') as order_number
      from src
      where public.erp_try_numeric(j->>'order_number') is not null
        and (
          nullif($1->>'cursor', '') is null
          or public.erp_try_numeric(j->>'order_number') < public.erp_try_numeric($1->>'cursor')
        )
        and (
          nullif($1->>'orderType', '') is null
          or lower(coalesce(j->>'order_type','')) like '%%' || lower($1->>'orderType') || '%%'
        )
        and case lower(coalesce($1->>'context',''))
          when 'current' then (
            (nullif($1->>'memberId','') is not null and coalesce(j->>'team_member_id','') = $1->>'memberId')
            or exists (
              select 1
              from jsonb_array_elements_text(coalesce($1->'memberNames', '[]'::jsonb)) n(value)
              where lower(coalesce(j->>'team_member_name','')) like '%%' || lower(n.value) || '%%'
            )
            or nullif(btrim(coalesce(j->>'team_member_name','')), '') is null
          )
          when 'review' then (
            (
              exists (
                select 1
                from jsonb_array_elements_text(coalesce($1->'visibleIds', '[]'::jsonb)) i(value)
                where coalesce(j->>'team_member_id','') = i.value
              )
              or exists (
                select 1
                from jsonb_array_elements_text(coalesce($1->'visibleNames', '[]'::jsonb)) n(value)
                where lower(coalesce(j->>'team_member_name','')) like '%%' || lower(n.value) || '%%'
              )
            )
            and case lower(coalesce($1->>'tab','all'))
              when 'approved' then lower(coalesce(j->>'sv_approval','')) like '%%approved%%'
              when 'rejected' then lower(coalesce(j->>'sv_approval','')) like '%%reject%%'
              when 'archive' then lower(coalesce(j->>'status','')) like '%%archive%%'
              else true
            end
          )
          when 'maintenance' then lower(coalesce(j->>'order_type','')) like '%%maintenance%%'
          else true
        end
    )
    select distinct f.order_number
    from filtered f
    order by f.order_number desc
    limit greatest(1, least(301, coalesce(public.erp_try_numeric($1->>'limit')::int, 91)))
  $sql$, v_table)
  using p_options;
end;
$$;


-- Compact order-summary loader used by Orders Review and Operations Orders.
-- It filters by the indexed order_number column and builds only the compact
-- fields that exist in the current schema, so optional columns cannot force select=*
-- and large unrelated row payloads are never serialized.
create or replace function public.erp_order_summary_rows(
  p_options jsonb default '{}'::jsonb
)
returns table(row_data jsonb)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table regclass := to_regclass('public.orders');
  v_numbers numeric[];
  v_csv text;
  v_cols jsonb := '{}'::jsonb;
  v_pairs text;
  v_created_expr text := 'NULL::timestamptz';
  v_id_expr text := quote_literal('');
begin
  if coalesce(lower(p_options->>'context'), '') = '__probe__'
     or coalesce((p_options->>'probe')::boolean, false) then
    return;
  end if;
  if v_table is null then
    raise exception 'ERP accelerator requires public.orders';
  end if;

  select coalesce(jsonb_object_agg(c.column_name, true), '{}'::jsonb)
    into v_cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'orders'
    and c.column_name = any(array[
      'id','reason','order_number','order_type','notion_created_time','created_at',
      'unit_price','quantity_requested','quantity_progress','quantity_edited_by_supervisor',
      'quantity_received_by_operations','quantity_remaining','status','issue_description',
      'actual_issue_description','repair_action','resolution_method','operations_approval',
      'rejected_reason','team_member_id','team_member_name','sv_approval','product_name',
      'receipt_number','person_received_by_operations'
    ]);

  if not (v_cols ? 'order_number') then
    raise exception 'ERP accelerator requires public.orders.order_number';
  end if;

  select array_agg(v order by v desc)
    into v_numbers
  from (
    select distinct public.erp_try_numeric(value) as v
    from jsonb_array_elements_text(coalesce(p_options->'orderNumbers', '[]'::jsonb))
  ) n
  where v is not null;

  if coalesce(array_length(v_numbers, 1), 0) = 0 then
    return;
  end if;

  -- Do not call to_jsonb(o) on the full orders row. Some installations keep
  -- large JSON/files columns on each component row; serializing those columns
  -- just to discard them dominated the summary P95. Build the compact JSON
  -- directly from the columns that actually exist in this schema instead.
  select string_agg(
    format(
      '%L, %s',
      m.output_key,
      case
        when v_cols ? m.column_name then format('to_jsonb(o.%I)', m.column_name)
        else '''null''::jsonb'
      end
    ),
    ', ' order by m.ord
  )
  into v_pairs
  from (values
    (1,'id','id'),
    (2,'reason','reason'),
    (3,'order_number','order_number'),
    (4,'order_type','order_type'),
    (5,'notion_created_time','notion_created_time'),
    (6,'unit_price','unit_price'),
    (7,'quantity_requested','quantity_requested'),
    (8,'quantity_progress','quantity_progress'),
    (9,'quantity_edited_by_supervisor','quantity_edited_by_supervisor'),
    (10,'quantity_received_by_operations','quantity_received_by_operations'),
    (11,'quantity_remaining','quantity_remaining'),
    (12,'status','status'),
    (13,'issue_description','issue_description'),
    (14,'actual_issue_description','actual_issue_description'),
    (15,'repair_action','repair_action'),
    (16,'resolution_method','resolution_method'),
    (17,'operations_approval','operations_approval'),
    (18,'rejected_reason','rejected_reason'),
    (19,'team_member_id','team_member_id'),
    (20,'team_member_name','team_member_name'),
    (21,'sv_approval','sv_approval'),
    (22,'product_name','product_name'),
    (23,'receipt_number','receipt_number'),
    (24,'person_received_by_operations','person_received_by_operations')
  ) as m(ord, output_key, column_name);

  if v_cols ? 'notion_created_time' then
    v_created_expr := 'public.erp_try_timestamptz(o.notion_created_time::text)';
  elsif v_cols ? 'created_at' then
    v_created_expr := 'public.erp_try_timestamptz(o.created_at::text)';
  end if;
  if v_cols ? 'id' then
    v_id_expr := 'o.id::text';
  end if;

  -- Values have already been parsed as numeric, so the generated IN list is
  -- injection-safe and lets PostgreSQL use idx_erp_orders_order_number.
  v_csv := array_to_string(v_numbers, ',');

  return query execute format($sql$
    select jsonb_build_object(%s) as row_data
    from %s o
    where o.order_number in (%s)
    order by o.order_number desc,
             %s desc nulls last,
             %s desc
  $sql$, v_pairs, v_table, v_csv, v_created_expr, v_id_expr);
end;
$$;

-- Bundle the compact row RPC into one PostgREST row. The row-based RPC
-- remains available as a compatibility fallback, but PostgREST commonly caps
-- set-returning responses at 1000 rows. Large order groups can exceed that cap
-- and previously forced the Next layer to make many sequential 5-order calls.
-- Aggregating inside PostgreSQL preserves the exact compact row shape while
-- removing the row cap and repeated HTTP/RPC round trips.
create or replace function public.erp_order_summary_bundle(
  p_options jsonb default '{}'::jsonb
)
returns table(payload jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(r.row_data), '[]'::jsonb) as payload
  from public.erp_order_summary_rows(p_options) r;
$$;

create or replace function public.erp_home_order_groups(
  p_options jsonb default '{}'::jsonb
)
returns table(
  group_key text,
  order_number numeric,
  created_time text,
  team_member_id text,
  team_member_name text,
  reason text,
  product_name text,
  item_count bigint,
  total_cost numeric,
  order_type_bucket text,
  current_bucket text,
  review_bucket_all text,
  review_item_count bigint,
  review_total_cost numeric,
  review_order_type_bucket text,
  review_bucket text,
  approved_item_count bigint,
  approved_total_cost numeric,
  approved_order_type_bucket text,
  approved_operations_bucket text,
  approved_maintenance_bucket text,
  has_approved_rows boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table regclass := to_regclass('public.orders');
  v_cols jsonb := '{}'::jsonb;
  v_id text := quote_literal('');
  v_order_number text := quote_literal('');
  v_created text := quote_literal('');
  v_team_member_id text := quote_literal('');
  v_team_member_name text := quote_literal('');
  v_reason text := quote_literal('');
  v_product_name text := quote_literal('');
  v_order_type text := quote_literal('');
  v_status text := quote_literal('');
  v_sv_approval text := quote_literal('');
  v_repair_action text := quote_literal('');
  v_resolution_method text := quote_literal('');
  v_qty_edited text := quote_literal('');
  v_qty_requested text := quote_literal('');
  v_qty_progress text := quote_literal('');
  v_unit_price text := quote_literal('');
  v_source_sql text;
begin
  if coalesce((p_options->>'probe')::boolean, false) then return; end if;
  if v_table is null then raise exception 'ERP accelerator requires public.orders'; end if;

  select coalesce(jsonb_object_agg(c.column_name, true), '{}'::jsonb)
    into v_cols
  from information_schema.columns c
  where c.table_schema='public' and c.table_name='orders'
    and c.column_name = any(array[
      'id','order_number','notion_created_time','created_at','team_member_id','team_member_name',
      'reason','product_name','order_type','status','sv_approval','repair_action','resolution_method',
      'quantity_edited_by_supervisor','quantity_requested','quantity_progress','unit_price'
    ]);

  -- Keep every dynamic expression text-only. Unlike to_jsonb(o), PostgreSQL
  -- only touches/detoasts the small columns required by the Home dashboard.
  if v_cols ? 'id' then v_id := 'o.id::text'; end if;
  if v_cols ? 'order_number' then v_order_number := 'o.order_number::text'; end if;
  if v_cols ? 'notion_created_time' then
    v_created := 'o.notion_created_time::text';
  elsif v_cols ? 'created_at' then
    v_created := 'o.created_at::text';
  end if;
  if v_cols ? 'team_member_id' then v_team_member_id := 'o.team_member_id::text'; end if;
  if v_cols ? 'team_member_name' then v_team_member_name := 'o.team_member_name::text'; end if;
  if v_cols ? 'reason' then v_reason := 'o.reason::text'; end if;
  if v_cols ? 'product_name' then v_product_name := 'o.product_name::text'; end if;
  if v_cols ? 'order_type' then v_order_type := 'o.order_type::text'; end if;
  if v_cols ? 'status' then v_status := 'o.status::text'; end if;
  if v_cols ? 'sv_approval' then v_sv_approval := 'o.sv_approval::text'; end if;
  if v_cols ? 'repair_action' then v_repair_action := 'o.repair_action::text'; end if;
  if v_cols ? 'resolution_method' then v_resolution_method := 'o.resolution_method::text'; end if;
  if v_cols ? 'quantity_edited_by_supervisor' then v_qty_edited := 'o.quantity_edited_by_supervisor::text'; end if;
  if v_cols ? 'quantity_requested' then v_qty_requested := 'o.quantity_requested::text'; end if;
  if v_cols ? 'quantity_progress' then v_qty_progress := 'o.quantity_progress::text'; end if;
  if v_cols ? 'unit_price' then v_unit_price := 'o.unit_price::text'; end if;

  v_source_sql := format($src$
    select
      coalesce(
        nullif(%s,''),
        'row:' || coalesce(
          nullif(%s,''),
          md5(concat_ws('|', %s, %s, %s, %s))
        )
      ) as group_key,
      public.erp_try_numeric(%s) as order_number,
      coalesce(%s,'') as created_time,
      coalesce(%s,'') as team_member_id,
      coalesce(%s,'') as team_member_name,
      coalesce(%s,'') as reason,
      coalesce(%s,'') as product_name,
      coalesce(%s,'') as order_type,
      coalesce(%s,'') as status,
      coalesce(%s,'') as sv_approval,
      coalesce(%s,'') as repair_action,
      coalesce(%s,'') as resolution_method,
      coalesce(
        public.erp_try_numeric(%s),
        public.erp_try_numeric(%s),
        public.erp_try_numeric(%s),
        1
      ) * coalesce(public.erp_try_numeric(%s), 0) as row_cost,
      (
        exists (
          select 1 from jsonb_array_elements_text(coalesce($1->'reviewerIds','[]'::jsonb)) x(value)
          where coalesce(%s,'') = x.value
        )
        or exists (
          select 1 from jsonb_array_elements_text(coalesce($1->'reviewerNames','[]'::jsonb)) x(value)
          where lower(coalesce(%s,'')) like '%%' || lower(x.value) || '%%'
        )
      ) as reviewer_visible,
      lower(coalesce(%s,'')) like '%%approved%%' as approved
    from %s o
  $src$,
    v_order_number, v_id, v_created, v_team_member_id, v_team_member_name, v_reason,
    v_order_number, v_created, v_team_member_id, v_team_member_name, v_reason, v_product_name,
    v_order_type, v_status, v_sv_approval, v_repair_action, v_resolution_method,
    v_qty_edited, v_qty_requested, v_qty_progress, v_unit_price,
    v_team_member_id, v_team_member_name, v_sv_approval, v_table
  );

  return query execute format($sql$
    with shaped as (
      %s
    ), wanted as (
      select *
      from shaped s
      where
        case
          when nullif($1->>'selectedUserId','') is not null or nullif($1->>'selectedUserName','') is not null then (
            (nullif($1->>'selectedUserId','') is not null and s.team_member_id = $1->>'selectedUserId')
            or (nullif($1->>'selectedUserName','') is not null and lower(s.team_member_name) like '%%' || lower($1->>'selectedUserName') || '%%')
          )
          else (
            (
              coalesce(($1->>'includeCurrent')::boolean, false)
              and (
                (nullif($1->>'currentUserId','') is not null and s.team_member_id = $1->>'currentUserId')
                or (nullif($1->>'currentUserName','') is not null and lower(s.team_member_name) like '%%' || lower($1->>'currentUserName') || '%%')
                or nullif(btrim(s.team_member_name), '') is null
              )
            )
            or (coalesce(($1->>'includeReview')::boolean, false) and s.reviewer_visible)
            or (coalesce(($1->>'includeApproved')::boolean, false) and s.approved)
          )
        end
    ), agg as (
      select
        w.group_key,
        max(w.order_number) as order_number,
        max(w.created_time) as created_time,
        max(nullif(w.team_member_id,'')) as team_member_id,
        max(nullif(w.team_member_name,'')) as team_member_name,
        max(nullif(w.reason,'')) as reason,
        max(nullif(w.product_name,'')) as product_name,
        count(*)::bigint as item_count,
        coalesce(sum(w.row_cost),0)::numeric as total_cost,
        case
          when bool_or(lower(w.order_type) like '%%maintenance%%') then 'maintenance'
          when bool_or(lower(w.order_type) like '%%withdraw%%') then 'withdrawal'
          else 'request'
        end as order_type_bucket,
        case
          when bool_or(lower(w.status) like '%%reject%%' or lower(w.status) like '%%cancel%%') then 'rejected'
          when bool_and(lower(w.status) ~ '(complete|deliver|done|arrived)') then 'completed'
          else 'progress'
        end as current_bucket,
        case
          when bool_or(lower(w.sv_approval) like '%%reject%%') then 'rejected'
          when bool_and(lower(w.sv_approval) like '%%approved%%') then 'approved'
          else 'pending'
        end as review_bucket_all,
        case
          when nullif($1->>'selectedUserId','') is not null or nullif($1->>'selectedUserName','') is not null
            then count(*)::bigint
          else (count(*) filter (where w.reviewer_visible))::bigint
        end as review_item_count,
        case
          when nullif($1->>'selectedUserId','') is not null or nullif($1->>'selectedUserName','') is not null
            then coalesce(sum(w.row_cost),0)::numeric
          else coalesce(sum(w.row_cost) filter (where w.reviewer_visible),0)::numeric
        end as review_total_cost,
        case
          when bool_or(lower(w.order_type) like '%%maintenance%%') then 'maintenance'
          when bool_or(lower(w.order_type) like '%%withdraw%%') then 'withdrawal'
          else 'request'
        end as review_order_type_bucket,
        case
          when count(*) filter (where w.reviewer_visible) = 0 then 'pending'
          when bool_or(lower(w.sv_approval) like '%%reject%%') filter (where w.reviewer_visible) then 'rejected'
          when bool_and(lower(w.sv_approval) like '%%approved%%') filter (where w.reviewer_visible) then 'approved'
          else 'pending'
        end as review_bucket,
        (count(*) filter (where w.approved))::bigint as approved_item_count,
        coalesce(sum(w.row_cost) filter (where w.approved),0)::numeric as approved_total_cost,
        case
          when bool_or(lower(w.order_type) like '%%maintenance%%') filter (where w.approved) then 'maintenance'
          when bool_or(lower(w.order_type) like '%%withdraw%%') filter (where w.approved) then 'withdrawal'
          else 'request'
        end as approved_order_type_bucket,
        case
          when count(*) filter (where w.approved) = 0 then 'pending'
          when bool_or(lower(w.status) ~ '(deliver|complete|arrived)') filter (where w.approved) then 'delivered'
          when bool_or(lower(w.status) ~ '(receive|prepare|ship)') filter (where w.approved) then 'received'
          else 'pending'
        end as approved_operations_bucket,
        case
          when count(*) filter (where w.approved) = 0 then 'pending'
          when bool_or(lower(w.status) ~ '(deliver|complete|done|arrived)') filter (where w.approved) then 'completed'
          when bool_or(
            nullif(btrim(w.repair_action),'') is not null
            or nullif(btrim(w.resolution_method),'') is not null
            or lower(w.status) ~ '(progress|repair|receive)'
          ) filter (where w.approved) then 'progress'
          else 'pending'
        end as approved_maintenance_bucket,
        bool_or(w.approved) as has_approved_rows
      from wanted w
      group by w.group_key
    )
    select
      a.group_key, a.order_number, a.created_time,
      coalesce(a.team_member_id,''), coalesce(a.team_member_name,''),
      coalesce(a.reason,''), coalesce(a.product_name,''),
      a.item_count, a.total_cost, a.order_type_bucket, a.current_bucket,
      a.review_bucket_all, a.review_item_count, a.review_total_cost,
      a.review_order_type_bucket, a.review_bucket,
      a.approved_item_count, a.approved_total_cost, a.approved_order_type_bucket,
      a.approved_operations_bucket, a.approved_maintenance_bucket, a.has_approved_rows
    from agg a
    order by public.erp_try_timestamptz(a.created_time) desc nulls last, a.order_number desc nulls last
  $sql$, v_source_sql)
  using p_options;
end;
$$;

create or replace function public.erp_home_stock_summary(
  p_options jsonb default '{}'::jsonb
)
returns table(
  tag_name text,
  quantity numeric,
  cost numeric,
  records bigint,
  quantity_column text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table regclass := to_regclass('public.stocktaking');
  v_requested text := nullif(btrim(p_options->>'stocktakingColumn'), '');
  v_requested_token text;
  v_quantity_col text;
  v_tag_col text;
  v_price_col text;
begin
  if coalesce((p_options->>'probe')::boolean, false) then return; end if;
  if v_table is null then raise exception 'ERP accelerator requires public.stocktaking'; end if;
  if v_requested is null then raise exception 'stocktakingColumn is required'; end if;

  v_requested_token := public.erp_canonical_token(v_requested);

  select c.column_name into v_quantity_col
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'stocktaking'
  order by
    case
      when c.column_name = v_requested then 0
      when lower(c.column_name) = lower(v_requested) then 1
      when public.erp_canonical_token(c.column_name) = v_requested_token then 2
      when public.erp_canonical_token(c.column_name) = v_requested_token || 'done' then 3
      when public.erp_canonical_token(c.column_name) = v_requested_token || '2ndterm' then 4
      when public.erp_canonical_token(c.column_name) = regexp_replace(v_requested_token, '(done|2ndterm)$', '') then 5
      else 99
    end,
    c.ordinal_position
  limit 1;

  if v_quantity_col is null
     or not (
       v_quantity_col = v_requested
       or lower(v_quantity_col) = lower(v_requested)
       or public.erp_canonical_token(v_quantity_col) in (
         v_requested_token,
         v_requested_token || 'done',
         v_requested_token || '2ndterm',
         regexp_replace(v_requested_token, '(done|2ndterm)$', '')
       )
     ) then
    raise exception 'Could not resolve Stocktaking quantity column %', v_requested;
  end if;

  select c.column_name into v_tag_col
  from information_schema.columns c
  where c.table_schema='public' and c.table_name='stocktaking'
    and lower(c.column_name) in ('tag','tags')
  order by case lower(c.column_name) when 'tag' then 0 else 1 end
  limit 1;

  select c.column_name into v_price_col
  from information_schema.columns c
  where c.table_schema='public' and c.table_name='stocktaking'
    and lower(c.column_name) in ('unity_price','unit_price','one_piece_price')
  order by case lower(c.column_name)
    when 'unity_price' then 0 when 'unit_price' then 1 else 2 end
  limit 1;

  return query execute format($sql$
    with vals as (
      select
        coalesce(nullif(btrim(%s),''), 'Untagged') as tag_name,
        public.erp_try_numeric(to_jsonb(s)->>%L) as q,
        coalesce(public.erp_try_numeric(%s),0) as unit_price
      from %s s
    )
    select
      v.tag_name,
      coalesce(sum(v.q),0)::numeric as quantity,
      coalesce(sum(v.q * v.unit_price),0)::numeric as cost,
      count(*)::bigint as records,
      %L::text as quantity_column
    from vals v
    where coalesce(v.q,0) <> 0
    group by v.tag_name
    order by v.tag_name
  $sql$,
    case when v_tag_col is null then quote_literal('Untagged') else format('to_jsonb(s)->>%L', v_tag_col) end,
    v_quantity_col,
    case when v_price_col is null then quote_literal('0') else format('to_jsonb(s)->>%L', v_price_col) end,
    v_table,
    v_quantity_col
  );
end;
$$;

create or replace function public.erp_home_expenses_summary(
  p_options jsonb default '{}'::jsonb
)
returns table(month_index integer, year_no integer, value numeric)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table regclass := to_regclass('public.expenses');
begin
  if coalesce((p_options->>'probe')::boolean, false) then return; end if;
  if v_table is null then raise exception 'ERP accelerator requires public.expenses'; end if;

  return query execute format($sql$
    with src as (
      select to_jsonb(e) as j from %s e
    ), shaped as (
      select
        coalesce(
          public.erp_try_timestamptz(j->>'expense_date'),
          public.erp_try_timestamptz(j->>'notion_created_time'),
          public.erp_try_timestamptz(j->>'created_at')
        ) as ts,
        coalesce(public.erp_try_numeric(j->>'cash_out'),0) as cash_out,
        coalesce(j->>'user_id','') as user_id,
        coalesce(j->>'team_member_name', j->>'team_member_raw','') as member_name
      from src
    ), wanted as (
      select * from shaped s
      where s.ts is not null
        and extract(year from s.ts)::int = extract(year from now())::int
        and (
          exists (
            select 1 from jsonb_array_elements_text(coalesce($1->'userIds','[]'::jsonb)) x(value)
            where lower(s.user_id) = lower(x.value)
          )
          or exists (
            select 1 from jsonb_array_elements_text(coalesce($1->'names','[]'::jsonb)) x(value)
            where lower(s.member_name) like '%%' || lower(x.value) || '%%'
               or lower(x.value) like '%%' || lower(s.member_name) || '%%'
          )
        )
        and case lower(coalesce($1->>'duration','all'))
          when 'week' then s.ts >= now() - interval '7 days'
          when 'month' then s.ts >= now() - interval '1 month'
          when 'year' then s.ts >= now() - interval '1 year'
          else true
        end
    )
    select
      (extract(month from w.ts)::int - 1) as month_index,
      extract(year from w.ts)::int as year_no,
      coalesce(sum(w.cash_out),0)::numeric as value
    from wanted w
    group by 1,2
    order by 2,1
  $sql$, v_table)
  using p_options;
end;
$$;

create or replace function public.erp_stocktaking_folder_summaries()
returns table(column_name text, items_count bigint, total_quantity numeric)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table regclass := to_regclass('public.stocktaking');
begin
  if v_table is null then raise exception 'ERP accelerator requires public.stocktaking'; end if;

  return query execute format($sql$
    with cells as (
      select
        kv.key as column_name,
        public.erp_try_numeric(kv.value) as value,
        public.erp_canonical_token(kv.key) as token,
        lower(kv.key) as raw_key
      from %s s
      cross join lateral jsonb_each_text(to_jsonb(s)) kv
    ), wanted as (
      select * from cells c
      where c.value is not null
        and c.value <> 0
        and c.token <> all(array[
          'id','createdat','updatedat','importedat','createdtime','lasteditedtime','lasteditedby',
          'name','product','products','productname','producturl','itemurl','url','tag','tags',
          'componenttag','producttag','kittag','sourcekit','sourceorderid','sourceordernumber',
          'orderid','ordernumber','ordertype','teammemberid','teammembername','userid','username',
          'createdby','ownername','employee','school','stocktakingcolumn','idcode','customizeid',
          'receiptnumber','receiptphotos','receiptphoto','receiptimages','receiptimage','receipturls',
          'receipturl','orderreceipt','attachments','files','onekitquantity','unityprice','unitprice',
          'onepieceprice','totalprice','totalcost','totalquantity','allprice','manualquantitytopurchase',
          'quantitytopurchase','allschoolsneed','allschoolsquantities','allschoolsstock','schoolkit',
          'schooltotalquantites','schooltotalquantities'
        ]::text[])
        and c.token !~ '^(g|grade)[0-9]'
        and c.token <> all(array['checkbox','button','a','b','c']::text[])
        and not (c.token ~ '(inventory|defected|defecated)' and c.raw_key ~ '[0-9]{4}[_-]?[0-9]{2}[_-]?[0-9]{2}')
    )
    select
      w.column_name,
      count(*)::bigint as items_count,
      coalesce(sum(w.value),0)::numeric as total_quantity
    from wanted w
    group by w.column_name
    order by w.column_name
  $sql$, v_table);
end;
$$;

create or replace function public.erp_product_proposal_headers()
returns table(
  id text,
  name text,
  created_by text,
  created_by_id text,
  created_at text,
  updated_at text,
  combined_sources text,
  combine_logic text,
  items_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_headers regclass := to_regclass('public.product_proposals');
  v_items regclass := to_regclass('public.product_proposal_items');
begin
  if v_headers is null then raise exception 'ERP accelerator requires public.product_proposals'; end if;
  if v_items is null then
    return query execute format($sql$
      select
        j->>'id', coalesce(j->>'name',''), coalesce(j->>'created_by',''), coalesce(j->>'created_by_id',''),
        coalesce(j->>'created_at',''), coalesce(j->>'updated_at',''), coalesce(j->>'combined_sources',''),
        coalesce(j->>'combine_logic',''), 0::bigint
      from (select to_jsonb(p) j from %s p) x
      order by public.erp_try_timestamptz(j->>'updated_at') desc nulls last,
               public.erp_try_timestamptz(j->>'created_at') desc nulls last
    $sql$, v_headers);
    return;
  end if;

  return query execute format($sql$
    with p as (select to_jsonb(x) j from %s x),
         i as (select to_jsonb(x) j from %s x)
    select
      p.j->>'id', coalesce(p.j->>'name',''), coalesce(p.j->>'created_by',''), coalesce(p.j->>'created_by_id',''),
      coalesce(p.j->>'created_at',''), coalesce(p.j->>'updated_at',''), coalesce(p.j->>'combined_sources',''),
      coalesce(p.j->>'combine_logic',''), count(i.j)::bigint
    from p
    left join i on i.j->>'proposal_id' = p.j->>'id'
    group by p.j
    order by public.erp_try_timestamptz(p.j->>'updated_at') desc nulls last,
             public.erp_try_timestamptz(p.j->>'created_at') desc nulls last
  $sql$, v_headers, v_items);
end;
$$;

create or replace function public.erp_product_kit_headers()
returns table(
  id text,
  name text,
  created_by text,
  created_by_id text,
  created_at text,
  updated_at text,
  folder_id text,
  items_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_headers regclass := to_regclass('public.product_kits');
  v_items regclass := to_regclass('public.product_kit_items');
begin
  if v_headers is null then raise exception 'ERP accelerator requires public.product_kits'; end if;
  if v_items is null then
    return query execute format($sql$
      select
        j->>'id', coalesce(j->>'name',''), coalesce(j->>'created_by',''), coalesce(j->>'created_by_id',''),
        coalesce(j->>'created_at',''), coalesce(j->>'updated_at',''), coalesce(j->>'folder_id',''), 0::bigint
      from (select to_jsonb(k) j from %s k) x
      order by public.erp_try_timestamptz(j->>'updated_at') desc nulls last,
               public.erp_try_timestamptz(j->>'created_at') desc nulls last
    $sql$, v_headers);
    return;
  end if;

  return query execute format($sql$
    with k as (select to_jsonb(x) j from %s x),
         i as (select to_jsonb(x) j from %s x)
    select
      k.j->>'id', coalesce(k.j->>'name',''), coalesce(k.j->>'created_by',''), coalesce(k.j->>'created_by_id',''),
      coalesce(k.j->>'created_at',''), coalesce(k.j->>'updated_at',''), coalesce(k.j->>'folder_id',''), count(i.j)::bigint
    from k
    left join i on i.j->>'kit_id' = k.j->>'id'
    group by k.j
    order by public.erp_try_timestamptz(k.j->>'updated_at') desc nulls last,
             public.erp_try_timestamptz(k.j->>'created_at') desc nulls last
  $sql$, v_headers, v_items);
end;
$$;

create or replace function public.erp_expense_order_options()
returns table(order_number numeric, order_type text, relation_ids jsonb)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table regclass := to_regclass('public.orders');
begin
  if v_table is null then raise exception 'ERP accelerator requires public.orders'; end if;

  return query execute format($sql$
    with src as (select to_jsonb(o) j from %s o),
    wanted as (
      select
        public.erp_try_numeric(j->>'order_number') as order_number,
        coalesce(j->>'order_type','') as order_type,
        nullif(j->>'id','') as row_id
      from src
      where public.erp_try_numeric(j->>'order_number') is not null
        and lower(coalesce(j->>'sv_approval','')) like '%%approved%%'
    )
    select
      w.order_number,
      max(w.order_type) as order_type,
      coalesce(jsonb_agg(distinct w.row_id) filter (where w.row_id is not null), '[]'::jsonb) as relation_ids
    from wanted w
    group by w.order_number
    order by w.order_number desc
    limit 300
  $sql$, v_table);
end;
$$;

create or replace function public.erp_expense_type_options()
returns table(value text)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table regclass := to_regclass('public.expenses');
begin
  if v_table is null then raise exception 'ERP accelerator requires public.expenses'; end if;
  return query execute format($sql$
    select distinct nullif(btrim(j->>'funds_type'),'') as value
    from (select to_jsonb(e) j from %s e) x
    where nullif(btrim(j->>'funds_type'),'') is not null
    order by value
  $sql$, v_table);
end;
$$;

create or replace function public.erp_expense_users_summary()
returns table(
  member_key text,
  member_name text,
  total numeric,
  item_count bigint,
  last_settled_date text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_table regclass := to_regclass('public.expenses');
begin
  if v_table is null then raise exception 'ERP accelerator requires public.expenses'; end if;

  return query execute format($sql$
    with src as (select to_jsonb(e) j from %s e),
    shaped as (
      select
        coalesce(nullif(j->>'user_id',''), nullif(j->>'employee_code',''), nullif(j->>'team_member_name',''), nullif(j->>'team_member_raw',''), 'Unknown User') as member_key,
        coalesce(nullif(j->>'team_member_name',''), nullif(j->>'team_member_raw',''), 'Unknown User') as member_name,
        coalesce(public.erp_try_numeric(j->>'cash_in'),0) - coalesce(public.erp_try_numeric(j->>'cash_out'),0) as delta,
        coalesce(j->>'expense_date','') as expense_date,
        public.erp_canonical_token(j->>'funds_type') as funds_type_token,
        public.erp_canonical_token(j->>'reason') as reason_token
      from src
    )
    select
      s.member_key,
      max(s.member_name) as member_name,
      coalesce(sum(s.delta),0)::numeric as total,
      count(*)::bigint as item_count,
      max(nullif(s.expense_date,'')) filter (
        where s.funds_type_token = 'settledmyaccount' or s.reason_token = 'settledmyaccount'
      ) as last_settled_date
    from shaped s
    group by s.member_key
    order by max(s.member_name)
  $sql$, v_table);
end;
$$;

-- Explicit execution grants keep these functions callable through PostgREST.
-- They remain SECURITY INVOKER, so normal Supabase table/RLS permissions still
-- apply whenever the server is configured with an anon/authenticated key.
grant execute on function public.erp_try_numeric(text) to anon, authenticated, service_role;
grant execute on function public.erp_try_timestamptz(text) to anon, authenticated, service_role;
grant execute on function public.erp_canonical_token(text) to anon, authenticated, service_role;
grant execute on function public.erp_order_candidate_numbers(jsonb) to anon, authenticated, service_role;
grant execute on function public.erp_order_summary_rows(jsonb) to anon, authenticated, service_role;
grant execute on function public.erp_order_summary_bundle(jsonb) to anon, authenticated, service_role;
grant execute on function public.erp_home_order_groups(jsonb) to anon, authenticated, service_role;
grant execute on function public.erp_home_stock_summary(jsonb) to anon, authenticated, service_role;
grant execute on function public.erp_home_expenses_summary(jsonb) to anon, authenticated, service_role;
grant execute on function public.erp_stocktaking_folder_summaries() to anon, authenticated, service_role;
grant execute on function public.erp_product_proposal_headers() to anon, authenticated, service_role;
grant execute on function public.erp_product_kit_headers() to anon, authenticated, service_role;
grant execute on function public.erp_expense_order_options() to anon, authenticated, service_role;
grant execute on function public.erp_expense_type_options() to anon, authenticated, service_role;
grant execute on function public.erp_expense_users_summary() to anon, authenticated, service_role;

-- Diagnostic RPC. The Next.js performance endpoint can call this after the SQL
-- has been installed to report which acceleration objects are really active.
create or replace function public.erp_performance_acceleration_status()
returns table(kind text, name text, installed boolean)
language sql
stable
security definer
set search_path = public
as $$
  with expected(kind, name) as (
    values
      ('rpc','erp_order_candidate_numbers'),
      ('rpc','erp_order_summary_rows'),
      ('rpc','erp_order_summary_bundle'),
      ('rpc','erp_home_order_groups'),
      ('rpc','erp_home_stock_summary'),
      ('rpc','erp_home_expenses_summary'),
      ('rpc','erp_stocktaking_folder_summaries'),
      ('rpc','erp_product_proposal_headers'),
      ('rpc','erp_product_kit_headers'),
      ('rpc','erp_expense_order_options'),
      ('rpc','erp_expense_type_options'),
      ('rpc','erp_expense_users_summary')
  ), expected_indexes(name) as (
    values
      ('idx_erp_orders_order_number'),
      ('idx_erp_orders_member_order'),
      ('idx_erp_orders_member_name_order'),
      ('idx_erp_orders_status_order'),
      ('idx_erp_orders_sv_approval_order'),
      ('idx_erp_orders_type_order'),
      ('idx_erp_orders_created_order'),
      ('idx_erp_team_members_name'),
      ('idx_erp_team_members_employee_code'),
      ('idx_erp_page_access_member_page'),
      ('idx_erp_app_pages_sort'),
      ('idx_erp_sv_access_member'),
      ('idx_erp_signup_status_created'),
      ('idx_erp_notifications_user_ts'),
      ('idx_erp_notifications_user_notification'),
      ('idx_erp_notifications_user_read'),
      ('idx_erp_history_created_id'),
      ('idx_erp_expenses_user_date'),
      ('idx_erp_expenses_member_date'),
      ('idx_erp_expenses_member_raw_date'),
      ('idx_erp_expenses_funds_type'),
      ('idx_erp_expenses_created_id'),
      ('idx_erp_tickets_created_id'),
      ('idx_erp_sections_ticket_sort'),
      ('idx_erp_edges_ticket_id'),
      ('idx_erp_assignments_assignee_id'),
      ('idx_erp_assignments_section_id'),
      ('idx_erp_events_created_code'),
      ('idx_erp_events_status_created'),
      ('idx_erp_events_start_date'),
      ('idx_erp_event_components_active_name'),
      ('idx_erp_event_types_active_created'),
      ('idx_erp_event_categories_active_created'),
      ('idx_erp_b2c_fields_database_sort'),
      ('idx_erp_b2c_customers_database_created'),
      ('idx_erp_b2c_forms_database_default_created'),
      ('idx_erp_b2c_form_fields_form_sort'),
      ('idx_erp_proposal_items_proposal'),
      ('idx_erp_kit_items_kit'),
      ('idx_erp_kits_folder_created'),
      ('idx_erp_proposals_created_id')
  )
  select e.kind, e.name, exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = e.name
  )
  from expected e
  union all
  select 'index', i.name,
         exists(select 1 from pg_indexes p where p.schemaname = 'public' and p.indexname = i.name)
  from expected_indexes i
  order by kind, name;
$$;

grant execute on function public.erp_performance_acceleration_status() to anon, authenticated, service_role;

-- The helper is only needed while this migration runs.
drop function if exists public.erp_create_index_if_columns(text, text, text[], boolean[]);

-- Verification result shown in the SQL editor after the migration finishes.
select * from public.erp_performance_acceleration_status();
