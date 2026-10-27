-- Phase 2O: atomic replace of explicit manager -> visible member IDs.
-- Run once after Phase 2L (erp_member_scope_team_links). Run with a database admin.
-- If SUPABASE_TEAM_MEMBERS_TABLE is customized, review the team_members reference below.
create or replace function public.erp_replace_member_scope_team_links(
  p_manager_member_id text,
  p_visible_member_ids text[],
  p_expected_visible_member_ids text[]
)
returns text[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ids text[];
  v_count integer;
  v_existing text[];
  v_expected text[];
begin
  if p_manager_member_id is null or p_manager_member_id !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception 'Invalid manager ID' using errcode = '22023';
  end if;
  if p_visible_member_ids is null or cardinality(p_visible_member_ids) > 500
     or p_expected_visible_member_ids is null or cardinality(p_expected_visible_member_ids) > 500 then
    raise exception 'Invalid team member list' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct id order by id), array[]::text[])
    into v_ids from unnest(p_visible_member_ids) as selected(id);
  if exists(select 1 from unnest(v_ids) as selected(id)
    where selected.id is null or selected.id = p_manager_member_id or selected.id !~ '^[A-Za-z0-9_-]{1,128}$') then
    raise exception 'Invalid team member list' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct id order by id), array[]::text[])
    into v_expected from unnest(p_expected_visible_member_ids) as selected(id);
  if cardinality(v_expected) <> cardinality(p_expected_visible_member_ids) then
    raise exception 'Invalid expected team state' using errcode = '22023';
  end if;
  -- Serialize simultaneous edits to the same manager within this transaction.
  perform pg_advisory_xact_lock(hashtextextended('erp-team:' || p_manager_member_id, 0));
  if not exists (select 1 from public.team_members m where m.id::text = p_manager_member_id) then
    raise exception 'Manager not found' using errcode = '22023';
  end if;
  select count(*) into v_count from public.team_members m where m.id::text = any(v_ids);
  if v_count <> cardinality(v_ids) then
    raise exception 'One or more team members are missing' using errcode = '22023';
  end if;
  select coalesce(array_agg(visible_member_id order by visible_member_id), array[]::text[])
    into v_existing from public.erp_member_scope_team_links
    where manager_member_id = p_manager_member_id;
  if v_existing <> v_expected then
    raise exception 'Team relationships changed. Refresh and try again.' using errcode = '40001';
  end if;
  delete from public.erp_member_scope_team_links
    where manager_member_id = p_manager_member_id and not (visible_member_id = any(v_ids));
  insert into public.erp_member_scope_team_links (manager_member_id, visible_member_id)
    select p_manager_member_id, unnest(v_ids)
    on conflict (manager_member_id, visible_member_id) do nothing;
  return v_ids;
end;
$$;
revoke all on function public.erp_replace_member_scope_team_links(text, text[], text[]) from public, anon, authenticated;
grant execute on function public.erp_replace_member_scope_team_links(text, text[], text[]) to service_role;
