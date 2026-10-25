-- 0001: per-student applications (readiness checks) and saved bursaries.
-- Run once in the Supabase SQL Editor. Safe to re-run: every statement is idempotent.
--
-- Not stored by design: uploaded documents and anything read from them. Files stay on the student's
-- device and are read in memory by the API for each document check, then discarded.
-- Rollback: drop function public.delete_my_account(); drop table public.application_checks, public.saved_bursaries;

create table if not exists public.saved_bursaries (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bursary_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, bursary_id)
);

create table if not exists public.application_checks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bursary_id    uuid not null,
  bursary_title text not null check (char_length(bursary_title) <= 300),
  -- The applicant's own answers (name, course, income band...) and the computed result.
  basics        jsonb not null,
  result        jsonb not null,
  notes         text not null default '' check (char_length(notes) <= 4000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Bounded so one account cannot fill the database.
  constraint application_checks_size check (octet_length(basics::text) + octet_length(result::text) < 200000)
);
create index if not exists application_checks_user_idx on public.application_checks (user_id, updated_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists application_checks_touch on public.application_checks;
create trigger application_checks_touch before update on public.application_checks
  for each row execute function public.touch_updated_at();

-- Row-level security: a student can only ever see or change their own rows.
alter table public.saved_bursaries enable row level security;
alter table public.application_checks enable row level security;
revoke all on public.saved_bursaries, public.application_checks from anon;
grant select, insert, delete on public.saved_bursaries to authenticated;
grant select, insert, update, delete on public.application_checks to authenticated;

drop policy if exists "own saved bursaries" on public.saved_bursaries;
create policy "own saved bursaries" on public.saved_bursaries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own application checks" on public.application_checks;
create policy "own application checks" on public.application_checks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Self-service account deletion (POPIA right to erasure). Deleting the auth user cascades to every
-- row above. security definer runs as the owner, but it can only ever delete the caller's own account.
create or replace function public.delete_my_account() returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
