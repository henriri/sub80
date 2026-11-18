-- An imported run's own measurements cannot be edited by hand.
--
-- `activities.source` keeps the import paths apart: 'manual' for a run the
-- athlete entered, and 'fit_upload', 'polar' or 'wahoo' for one a device
-- recorded. Only 'manual' is written today, but `update_run` has always let any
-- run's distance, duration, date, heart rate and heart-rate source be
-- overwritten -- so the first FIT upload would arrive with a form that can
-- quietly contradict the file it came from. A device's measurements are the
-- record; typing over them loses the only copy of what actually happened.
--
-- WHAT STAYS EDITABLE for every source: `rpe`, `notes` and
-- `planned_workout_id`. Those are the athlete's own, not the device's. How hard
-- it felt is not in the file, what happened is not either, and which session a
-- run belongs to is a judgement nothing but the athlete can make -- it is also
-- the one the link exists to be corrected by.
--
-- COMPARED WITH `is not distinct from` throughout, not `=`: nulls are the
-- normal case here (no start time, no heart rate), and `null = null` is null,
-- which would make the guard fire on a run with no heart rate however it was
-- edited. The point of comparing at all rather than refusing outright is that a
-- form re-sends every field on every submit: an athlete changing only the note
-- of a FIT run posts the distance back unchanged, and that must succeed.
--
-- This is a `create or replace` of the function as it stands in
-- 20261116120000_log_runs.sql with one check added. Privileges survive a
-- replace, but the revoke and grant are restated below so the file says who may
-- call what without having to be read beside the other one.
--
-- Nothing else changes: no column is added, no row is touched, and RLS on
-- `activities` is untouched -- the four policies from the initial migration key
-- on user_id only and already cover every column here.
--
-- The TypeScript side of this rule is `statsChanged` in
-- src/lib/runs/source-guard.ts, which the Server Action re-runs against the
-- freshly read row before calling this, exactly as validateRun guards the
-- bounds. The form uses it too, to render those fields read-only rather than
-- letting the athlete type into a field that will be refused.

create or replace function public.update_run(
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
  v_local timestamp;
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

  -- The measurements of an imported run are the device's record of what
  -- happened. Checked AFTER the bounds above, so a nonsensical value is still
  -- answered as nonsense whatever the source, and before anything is written.
  --
  -- The stored instant is turned back into the local date and time the form
  -- shows, so the comparison is between what the athlete can see and what they
  -- posted. start_time_known is why the time is null rather than midday: a run
  -- filed without a start time renders an empty field and posts one back.
  if v_activity.source <> 'manual' then
    v_local := v_activity.started_at at time zone 'Europe/Paris';

    if not (
          p_date is not distinct from v_local::date
      and p_time is not distinct from
            (case when v_activity.start_time_known then v_local::time end)
      and p_distance_m is not distinct from v_activity.distance_m
      and p_duration_s is not distinct from v_activity.duration_s
      and p_avg_hr is not distinct from v_activity.avg_hr
      and p_hr_source is not distinct from v_activity.hr_source
    ) then
      raise exception
        'update_run: this run came from %, so its measurements cannot be changed by hand',
        v_activity.source
        using errcode = 'P0001';
    end if;
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
  'Edits a logged run. A run whose source is not ''manual'' refuses any change '
  'to its own measurements -- the date and time, distance, duration, heart rate '
  'and heart-rate source -- compared with IS NOT DISTINCT FROM, so a form that '
  're-sends them unchanged still succeeds; rpe, notes and planned_workout_id '
  'stay editable for every source. Re-snapshots planned_pace_zone and vdot_used '
  'only when the linked workout changes, and clears both when the run is '
  'unlinked, so editing a note never re-dates the target a run is judged '
  'against. Marks a newly linked planned or skipped session completed; never '
  'changes the status of one it was unlinked from. Writes no plan_events row.';

-- Restated rather than relied on: a create or replace keeps the privileges it
-- had, and saying so here means this file can be read on its own.
revoke execute on function public.update_run(
  uuid, date, time, integer, integer, integer, text, integer, text, uuid)
  from public, anon;
grant execute on function public.update_run(
  uuid, date, time, integer, integer, integer, text, integer, text, uuid)
  to authenticated;
