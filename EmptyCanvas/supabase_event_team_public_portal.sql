-- Event Team public registration portal
-- Run once in Supabase SQL Editor before publishing the public team links.

create extension if not exists pgcrypto;

alter table if exists public.event_team_members
  add column if not exists national_id text;

create unique index if not exists event_team_members_national_id_unique
  on public.event_team_members (national_id)
  where national_id is not null and btrim(national_id) <> '';

create table if not exists public.event_team_public_accounts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.event_team_members(id) on delete cascade,
  national_id text not null unique,
  password_hash text not null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_team_public_accounts_member_idx
  on public.event_team_public_accounts(member_id);

alter table public.event_team_public_accounts enable row level security;

-- No anon/authenticated policies are intentionally created. The Next.js server
-- accesses this table with the server-side Supabase service key so password
-- hashes are never exposed to browsers.

create or replace function public.touch_event_team_public_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_event_team_public_accounts_updated_at on public.event_team_public_accounts;
create trigger trg_event_team_public_accounts_updated_at
before update on public.event_team_public_accounts
for each row execute function public.touch_event_team_public_accounts_updated_at();
