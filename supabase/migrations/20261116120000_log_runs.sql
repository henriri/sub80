-- Logging a run by hand: the columns an entered run needs, and the three
-- functions that write one.
--
-- Row-level security is UNCHANGED. `activities` keeps RLS enabled and the four
-- policies from the initial migration already cover every column added here,
-- since they key on user_id only. The table-level grant
-- (`select, insert, update, delete ... to authenticated`) covers them too.
--
-- `activities` is EMPTY: nothing has ever written to it, and this migration is
-- the first writer. That is what makes two changes below safe -- dropping the
-- NOT NULL on hr_source, and adding a constraint that requires avg_hr and
-- hr_source to be present together. A pre-existing row with an hr_source but
-- no avg_hr would be rejected, and this migration would then fail rather than
-- backfill anything silently. Same reasoning as plan_columns.sql.
--
-- A run is a FACT, not a plan change. None of the three functions writes a
-- plan_events row and none of them is on the undo stack: there is nothing to
-- propose or to reverse, only something that did or did not happen. The one
-- plan column they touch is a linked workout's `status`, which is recorded
-- under "Known limits" in CLAUDE.md.
--
-- What is checked here and what is not. These functions enforce what keeps the
-- data coherent: ownership (through RLS), a date that is not in the future,
-- the heart-rate pairing, and the two snapshot columns, which are read inside
-- SQL and can never be supplied by a caller. The training-domain bounds -- the
-- 2:00 to 20:00 /km pace window, 0.1 to 100 km, one minute to twelve hours --
-- are NOT checked here. They live in `validateRun` (src/lib/runs/rules.ts),
-- which the Server Action re-runs against the parsed input before calling
-- this, exactly as validateMove guards move_planned_workout. CLAUDE.md puts
-- measurement and validation in tested plain code, and those bounds need the
-- same rounding and unit semantics as the sentence the athlete reads.

-- activities: heart rate and its source --------------------------------------

-- Dropped by its exact name, without IF EXISTS: if the name ever differs this
-- migration must fail rather than leave the old check beside the new one.
alter table public.activities drop constraint activities_hr_source_check;

alter table public.activities alter column hr_source drop not null;

alter table public.activities
  add constraint activities_hr_source_check
    check (hr_source is null or hr_source in ('strap', 'wrist')),
  -- Required if and only if there is a heart rate: an equality between two
  -- null tests, so neither column can be present without the other. A reading
  -- whose source is unknown is worse than no reading, because the two are
  -- never mixed or averaged, and a source without a reading describes nothing.
  add constraint activities_hr_source_present_check
    check ((avg_hr is null) = (hr_source is null));

-- activities: what an entered run carries ------------------------------------

alter table public.activities
  add column rpe smallint check (rpe between 1 and 10),
  add column notes text check (length(notes) <= 2000),
  add column planned_pace_zone text
    check (planned_pace_zone in ('E', 'S', 'SS', 'T', 'I', 'R', '5K', '10K', 'HM')),
  add column vdot_used numeric(4,1) check (vdot_used between 25 and 85),
  add column source text not null default 'manual'
    check (source in ('manual', 'fit_upload', 'polar', 'wahoo')),
  -- False when no start time was entered. The run still needs an instant, so
  -- started_at holds midday Paris; this says not to show it as a real time.
  add column start_time_known boolean not null default true;

comment on column public.activities.rpe is
  'Rate of perceived effort, 1 to 10, as the athlete scored it. Not a computed '
  'number and not an effort score.';

comment on column public.activities.notes is
  'How the run felt, in the athlete''s own words. At most 2000 characters, the '
  'same limit as planned_workouts.notes.';

comment on column public.activities.planned_pace_zone is
  'SNAPSHOT of the linked workout''s pace_zone, copied inside SQL when the run '
  'is linked and re-copied only if the link changes. Null when there is no '
  'link. A client never supplies it: a later effort comparison must judge an '
  'old run against the target of its own day, not against today''s plan.';

comment on column public.activities.vdot_used is
  'SNAPSHOT of profiles.vdot as it was CONFIGURED when the run was linked. '
  'This is the profile''s setting, NOT a measured fitness and nothing derived '
  'from this run: it will read 47, the plan''s starting value, until pace '
  'analysis begins updating profiles.vdot. Copied inside SQL, like '
  'planned_pace_zone, because VDOT changes over time and the zone range a run '
  'was aimed at has to be reconstructable from the row alone.';

comment on column public.activities.source is
  'Where the activity came from. Only ''manual'' is written today; the other '
  'three are the import paths this column exists to keep apart.';

comment on column public.activities.start_time_known is
  'False when the athlete entered a date but no start time. started_at is then '
  'midday Europe/Paris, which must not be displayed as a real time.';

-- log_run --------------------------------------------------------------------

-- started_at is composed HERE rather than in TypeScript:
-- `(date + time) at time zone 'Europe/Paris'` makes Postgres do the
-- daylight-saving arithmetic, and the repo has no date library to do it with.
-- A local time inside the October fall-back hour (02:30 on 2027-10-31, say) is
-- genuinely ambiguous and Postgres resolves it deterministically to one of the
-- two instants; the midday default is never ambiguous.
create function public.log_run(
  p_date date,
  p_time time,
  p_distance_m integer,
  p_duration_s integer,
  p_avg_hr integer default null,
  p_hr_source text default null,
  p_rpe integer default null,
  p_notes text default null,
  p_planned_workout_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_workout public.planned_workouts;
  v_zone text := null;
  v_vdot numeric(4,1) := null;
  v_activity_id uuid;
begin
  if v_user is null then
    raise exception 'log_run: no signed-in user'
      using errcode = '42501';
  end if;

  -- Checked here rather than left to the column constraints, so the client
  -- gets a sentence instead of a constraint name it cannot read.
  if p_date > v_today then
    raise exception 'log_run: % is in the future', p_date
      using errcode = 'P0001';
  end if;

  if (p_avg_hr is null) <> (p_hr_source is null) then
    raise exception
      'log_run: a heart rate needs its source, and a source needs a heart rate'
      using errcode = 'P0001';
  end if;

  if p_hr_source is not null and p_hr_source not in ('strap', 'wrist') then
    raise exception 'log_run: % is not a heart-rate source', p_hr_source
      using errcode = 'P0001';
  end if;

  if p_avg_hr is not null and p_avg_hr not between 30 and 250 then
    raise exception 'log_run: % is not a believable heart rate', p_avg_hr
      using errcode = 'P0001';
  end if;

  if p_rpe is not null and p_rpe not between 1 and 10 then
    raise exception 'log_run: % is not an effort between 1 and 10', p_rpe
      using errcode = 'P0001';
  end if;

  if length(v_notes) > 2000 then
    raise exception 'log_run: a note is at most 2000 characters'
      using errcode = 'P0001';
  end if;

  -- The snapshots. Row-level security scopes this to the caller's own rows, so
  -- another user's workout is not found rather than refused -- and the
  -- composite foreign key on (user_id, planned_workout_id) would refuse the
  -- link even if a policy ever let the read through.
  if p_planned_workout_id is not null then
    select * into v_workout
      from public.planned_workouts
     where id = p_planned_workout_id
       for update;

    if not found then
      raise exception 'log_run: no such planned workout'
        using errcode = 'P0002';
    end if;

    v_zone := v_workout.pace_zone;

    select vdot into v_vdot from public.profiles where id = v_user;
  end if;

  insert into public.activities (
    user_id, planned_workout_id, started_at, start_time_known,
    distance_m, duration_s, avg_hr, hr_source, rpe, notes,
    planned_pace_zone, vdot_used
  )
  values (
    v_user,
    p_planned_workout_id,
    (p_date + coalesce(p_time, time '12:00')) at time zone 'Europe/Paris',
    p_time is not null,
    p_distance_m,
    p_duration_s,
    p_avg_hr::smallint,
    p_hr_source,
    p_rpe::smallint,
    v_notes,
    v_zone,
    v_vdot
  )
  returning id into v_activity_id;

  -- The run is what makes the session done. Only from planned or skipped: a
  -- session already completed stays completed, and nothing here un-completes
  -- one. No plan_events row -- see the header.
  if p_planned_workout_id is not null
     and v_workout.status in ('planned', 'skipped') then
    update public.planned_workouts
       set status = 'completed'
     where id = v_workout.id;
  end if;

  return v_activity_id;
end;
$$;

comment on function public.log_run(
  date, time, integer, integer, integer, text, integer, text, uuid) is
  'Records a run the athlete entered by hand. Composes started_at in '
  'Europe/Paris, snapshots the linked workout''s pace_zone and the profile''s '
  'current vdot inside SQL, and marks a linked planned or skipped session '
  'completed. Writes no plan_events row: a run is a fact, not a plan change. '
  'The pace, distance and duration bounds are enforced by validateRun in '
  'src/lib/runs/rules.ts, not here.';

revoke execute on function public.log_run(
  date, time, integer, integer, integer, text, integer, text, uuid)
  from public, anon;
grant execute on function public.log_run(
  date, time, integer, integer, integer, text, integer, text, uuid)
  to authenticated;

-- update_run -----------------------------------------------------------------

-- The snapshots are RE-TAKEN ONLY WHEN THE LINK CHANGES. That asymmetry is the
-- whole point of snapshotting: editing a note or fixing a distance must not
-- silently re-date the target the run is judged against. And when the link
-- becomes null the snapshots are CLEARED, because without a workout they
-- describe nothing and an orphaned zone would later be read as a real target.
create function public.update_run(
  p_activity_id uuid,
  p_date date,
  p_time time,
  p_distance_m integer,
  p_duration_s integer,
  p_avg_hr integer default null,
  p_hr_source text default null,
  p_rpe integer default null,
  p_notes text default null,
  p_planned_workout_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_activity public.activities;
  v_workout public.planned_workouts;
  v_link_changed boolean;
  v_zone text;
  v_vdot numeric(4,1);
begin
  if v_user is null then
    raise exception 'update_run: no signed-in user'
      using errcode = '42501';
  end if;

  select * into v_activity
    from public.activities
   where id = p_activity_id
     for update;

  if not found then
    raise exception 'update_run: no such run'
      using errcode = 'P0002';
  end if;

  if p_date > v_today then
    raise exception 'update_run: % is in the future', p_date
      using errcode = 'P0001';
  end if;

  if (p_avg_hr is null) <> (p_hr_source is null) then
    raise exception
      'update_run: a heart rate needs its source, and a source needs a heart rate'
      using errcode = 'P0001';
  end if;

  if p_hr_source is not null and p_hr_source not in ('strap', 'wrist') then
    raise exception 'update_run: % is not a heart-rate source', p_hr_source
      using errcode = 'P0001';
  end if;

  if p_avg_hr is not null and p_avg_hr not between 30 and 250 then
    raise exception 'update_run: % is not a believable heart rate', p_avg_hr
      using errcode = 'P0001';
  end if;

  if p_rpe is not null and p_rpe not between 1 and 10 then
    raise exception 'update_run: % is not an effort between 1 and 10', p_rpe
      using errcode = 'P0001';
  end if;

  if length(v_notes) > 2000 then
    raise exception 'update_run: a note is at most 2000 characters'
      using errcode = 'P0001';
  end if;

  v_link_changed :=
    p_planned_workout_id is distinct from v_activity.planned_workout_id;

  if not v_link_changed then
    -- Untouched, deliberately: the run is still aimed at the same session, so
    -- it keeps the target it was aimed at.
    v_zone := v_activity.planned_pace_zone;
    v_vdot := v_activity.vdot_used;
  elsif p_planned_workout_id is null then
    -- Unlinked. Both snapshots describe a workout that is no longer there.
    v_zone := null;
    v_vdot := null;
  else
    select * into v_workout
      from public.planned_workouts
     where id = p_planned_workout_id
       for update;

    if not found then
      raise exception 'update_run: no such planned workout'
        using errcode = 'P0002';
    end if;

    v_zone := v_workout.pace_zone;
    select vdot into v_vdot from public.profiles where id = v_user;
  end if;

  update public.activities
     set planned_workout_id = p_planned_workout_id,
         started_at =
           (p_date + coalesce(p_time, time '12:00')) at time zone 'Europe/Paris',
         start_time_known = p_time is not null,
         distance_m = p_distance_m,
         duration_s = p_duration_s,
         avg_hr = p_avg_hr::smallint,
         hr_source = p_hr_source,
         rpe = p_rpe::smallint,
         notes = v_notes,
         planned_pace_zone = v_zone,
         vdot_used = v_vdot
   where id = v_activity.id;

  -- A session the run has just been pointed at becomes done, on the same rule
  -- as log_run. A session it has been pointed AWAY from is deliberately left
  -- alone: that is delete_run's explicit, asked-for job, and changing a status
  -- nobody asked about would be a plan change made behind the athlete's back.
  if v_link_changed
     and p_planned_workout_id is not null
     and v_workout.status in ('planned', 'skipped') then
    update public.planned_workouts
       set status = 'completed'
     where id = v_workout.id;
  end if;

  return v_activity.id;
end;
$$;

comment on function public.update_run(
  uuid, date, time, integer, integer, integer, text, integer, text, uuid) is
  'Edits a logged run. Re-snapshots planned_pace_zone and vdot_used only when '
  'the linked workout changes, and clears both when the run is unlinked, so '
  'editing a note never re-dates the target a run is judged against. Marks a '
  'newly linked planned or skipped session completed; never changes the status '
  'of one it was unlinked from. Writes no plan_events row.';

revoke execute on function public.update_run(
  uuid, date, time, integer, integer, integer, text, integer, text, uuid)
  from public, anon;
grant execute on function public.update_run(
  uuid, date, time, integer, integer, integer, text, integer, text, uuid)
  to authenticated;

-- delete_run -----------------------------------------------------------------

-- `p_reset_workout` is the checkbox in the confirmation dialog, and the
-- function is written so that the checkbox cannot lie about what it did: being
-- asked to reset a run that is not linked, or one whose session still has
-- another run against it, RAISES rather than quietly doing nothing.
create function public.delete_run(
  p_activity_id uuid,
  p_reset_workout boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_activity public.activities;
  v_others integer;
begin
  if v_user is null then
    raise exception 'delete_run: no signed-in user'
      using errcode = '42501';
  end if;

  select * into v_activity
    from public.activities
   where id = p_activity_id
     for update;

  if not found then
    raise exception 'delete_run: no such run'
      using errcode = 'P0002';
  end if;

  if p_reset_workout then
    if v_activity.planned_workout_id is null then
      raise exception 'delete_run: that run is not linked to a session'
        using errcode = 'P0001';
    end if;

    -- Counted BEFORE the delete and excluding this run. Row-level security
    -- scopes it to the caller's own activities, which is the only scope that
    -- makes sense: a session belongs to one athlete.
    select count(*) into v_others
      from public.activities
     where planned_workout_id = v_activity.planned_workout_id
       and id <> v_activity.id;

    if v_others > 0 then
      raise exception
        'delete_run: another run is still linked to that session'
        using errcode = 'P0001';
    end if;
  end if;

  delete from public.activities where id = v_activity.id;

  -- Only a completed session is put back. Idempotent on purpose: if it is
  -- already planned there is nothing to undo, and the end state is exactly
  -- what the checkbox promised.
  if p_reset_workout then
    update public.planned_workouts
       set status = 'planned'
     where id = v_activity.planned_workout_id
       and status = 'completed';
  end if;

  return v_activity.id;
end;
$$;

comment on function public.delete_run(uuid, boolean) is
  'Deletes a logged run. With p_reset_workout, also puts its linked session '
  'back to planned -- but refuses when the run is not linked or when another '
  'run is still linked to that session, so the confirmation dialog''s checkbox '
  'cannot promise something that did not happen. Writes no plan_events row.';

revoke execute on function public.delete_run(uuid, boolean) from public, anon;
grant execute on function public.delete_run(uuid, boolean) to authenticated;
