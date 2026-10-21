-- Phase 2L: run once in Supabase SQL Editor BEFORE assigning Home Analysis = Team.
-- This table is an explicit visibility allowlist; it is NOT inferred from departments.
create table if not exists public.erp_member_scope_team_links (
  manager_member_id text not null,
  visible_member_id text not null,
  created_at timestamptz not null default now(),
  primary key (manager_member_id, visible_member_id),
  constraint erp_member_scope_team_no_self check (manager_member_id <> visible_member_id)
);
create index if not exists erp_member_scope_team_visible_idx
  on public.erp_member_scope_team_links (visible_member_id);
alter table public.erp_member_scope_team_links enable row level security;
revoke all on table public.erp_member_scope_team_links from anon, authenticated;
grant select, insert, update, delete on table public.erp_member_scope_team_links to service_role;
-- Example (replace IDs with verified team_members.id values; do NOT use employee names):
-- insert into public.erp_member_scope_team_links (manager_member_id, visible_member_id)
-- values ('ACTUAL_MANAGER_MEMBER_ID', 'ACTUAL_TEAM_MEMBER_ID')
-- on conflict do nothing;
-- Managers can always see their own analysis without a self-link.
