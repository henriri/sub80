-- Initial schema: profiles, planned_workouts, activities, plan_events.
--
-- Row-level security is ENABLED on every table in this migration. A user can
-- only read and write their own rows; `anon` has no access at all.
--
-- ENABLE, not FORCE: the table owner (`postgres`, which runs migrations and the
-- profile trigger below) bypasses RLS on a table with ENABLE only. With FORCE,
-- the owner is subject to the policies too, so the trigger's insert into
-- profiles would only work if `postgres` has BYPASSRLS. Supabase API roles
-- (`anon`, `authenticated`) never own these tables, so every client request is
-- checked against the policies either way.
--
-- Same-owner links (activity -> planned workout, event -> reverted event) are
-- enforced by composite foreign keys (user_id, id), so the database refuses a
-- cross-user reference whatever the policies say.

-- Shared helpers -------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Clients never insert or delete profiles: the trigger below creates the row
-- when an auth user is created, and deleting the auth user cascades. So there
-- are select and update policies only.
create policy "profiles: select own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Runs as the function owner (`postgres`), so RLS does not block the insert.
-- `search_path = ''` keeps the function from resolving names through a schema
-- the caller controls.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for users that already exist (for example, the owner created in the
-- dashboard before this migration ran).
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- planned_workouts -----------------------------------------------------------

create table public.planned_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  planned_date date not null, -- local calendar date, Europe/Paris
  kind text not null
    check (kind in ('easy', 'long', 'tempo', 'intervals', 'repetitions', 'race', 'rest')),
  title text not null check (length(title) > 0),
  is_key boolean not null default false, -- counts toward "two key sessions missed"
  target_distance_m integer check (target_distance_m > 0),
  target_duration_s integer check (target_duration_s > 0),
  target_pace_s_per_km integer check (target_pace_s_per_km > 0),
  notes text,
  status text not null default 'planned'
    check (status in ('planned', 'completed', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create index planned_workouts_user_date_idx
  on public.planned_workouts (user_id, planned_date);

alter table public.planned_workouts enable row level security;

create trigger planned_workouts_set_updated_at
  before update on public.planned_workouts
  for each row execute function public.set_updated_at();

create policy "planned_workouts: select own"
  on public.planned_workouts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "planned_workouts: insert own"
  on public.planned_workouts for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "planned_workouts: update own"
  on public.planned_workouts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "planned_workouts: delete own"
  on public.planned_workouts for delete to authenticated
  using (user_id = (select auth.uid()));

-- activities -----------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  planned_workout_id uuid,
  started_at timestamptz not null,
  distance_m integer not null check (distance_m >= 0),
  duration_s integer not null check (duration_s > 0),
  avg_hr smallint check (avg_hr between 30 and 250),
  -- Never mix or average the two sources.
  hr_source text not null check (hr_source in ('strap', 'wrist')),
  fit_file_path text, -- object path in the Storage bucket for raw FIT files
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  -- Same owner as the planned workout. If the workout is deleted, only the
  -- link is cleared (not user_id).
  foreign key (user_id, planned_workout_id)
    references public.planned_workouts (user_id, id)
    on delete set null (planned_workout_id)
);

create index activities_user_started_idx
  on public.activities (user_id, started_at desc);
create index activities_planned_workout_idx
  on public.activities (planned_workout_id);

alter table public.activities enable row level security;

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

create policy "activities: select own"
  on public.activities for select to authenticated
  using (user_id = (select auth.uid()));

create policy "activities: insert own"
  on public.activities for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "activities: update own"
  on public.activities for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "activities: delete own"
  on public.activities for delete to authenticated
  using (user_id = (select auth.uid()));

-- plan_events ----------------------------------------------------------------
-- Every plan change is a row here and can be undone. Undoing inserts a new
-- event that points at the original through reverts_event_id, and marks the
-- original 'undone'. Rows are never deleted, and only `status` can be updated.

create table public.plan_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (length(kind) > 0),
  source text not null check (source in ('user', 'coach', 'system')),
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'rejected', 'undone')),
  payload jsonb not null default '{}'::jsonb,
  reverts_event_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, reverts_event_id)
    references public.plan_events (user_id, id)
);

create index plan_events_user_created_idx
  on public.plan_events (user_id, created_at desc);
create index plan_events_reverts_idx
  on public.plan_events (reverts_event_id);

alter table public.plan_events enable row level security;

create policy "plan_events: select own"
  on public.plan_events for select to authenticated
  using (user_id = (select auth.uid()));

create policy "plan_events: insert own"
  on public.plan_events for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "plan_events: update own"
  on public.plan_events for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No delete policy: events are a permanent history.

-- Privileges -----------------------------------------------------------------
-- Explicit grants, so this does not depend on the project's default
-- privileges for the Data API. `anon` gets nothing.

revoke all on public.profiles, public.planned_workouts, public.activities, public.plan_events
  from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.planned_workouts to authenticated;
grant select, insert, update, delete on public.activities to authenticated;
grant select, insert on public.plan_events to authenticated;
grant update (status) on public.plan_events to authenticated;
