-- Every user change to a planned workout, and one undo that covers them all.
--
-- Row-level security is UNCHANGED. The new column is covered by the existing
-- planned_workouts policies, which key on user_id only, and by the existing
-- table-level grant. Every function here is SECURITY INVOKER with
-- `search_path = ''`, exactly as move_planned_workout is: the function runs
-- with the caller's own privileges, so another user's workout is simply not
-- visible to the SELECT and `not found` fires. No ownership test of our own is
-- needed, and none could be stronger than the policies.
--
-- WHY UNDO IS REWRITTEN. undo_plan_event was hard-wired to moves: it filtered
-- `kind = 'move_workout'` and restored three named columns. Four more undoable
-- actions would have meant four more undo paths, each free to disagree with
-- the others about what "put it back" means. So an event now carries `before`
-- and `after` -- the columns the change touched, and nothing else -- and one
-- generic undo writes `before` back. The stack rule is unchanged in substance
-- and widened in scope: the newest accepted user event that is not itself an
-- undo. There is still no redo.
--
-- The restore is a FIXED COLUMN LIST with no dynamic SQL. A payload is written
-- by these functions, but it is still data in a row, and a generic
-- `execute format(...)` over its keys would let anything that could write a
-- payload name the column it wanted set -- user_id included. Every comparison
-- and every assignment is keyed on the KEY BEING PRESENT, not on its value
-- being non-null, and uses IS [NOT] DISTINCT FROM: a change that cleared a
-- note records `"notes": null`, which must undo correctly rather than collapse
-- to unknown and refuse.
--
-- WHAT IS CHECKED HERE AND WHAT IS NOT. These functions enforce what keeps the
-- data coherent: ownership, a planned status where it matters, a date that is
-- not past where it matters, the notes length, that a change actually changes
-- something, and -- for the one action that could otherwise raise a week's
-- distance -- that a lighter day is genuinely lighter.
--
-- The 60 km ceiling is still NOT checked here. Lightening cannot raise a
-- week's total and this file refuses an increase, so lightening needs no
-- check at all. RESTORING CAN raise one: a run may have been moved into the
-- headroom the lightening freed. That check is validateRestore in
-- src/lib/plan/lighten.ts, which the Server Action re-runs against freshly
-- read rows, for the reason 20261104181000 already records -- the limit needs
-- the same rounding and unit semantics as the sentence the athlete reads, and
-- a PL/pgSQL twin would be a second definition of a safety limit. The cost is
-- recorded under "Known limits" in CLAUDE.md: a direct call to
-- restore_planned_distance can exceed the ceiling, and a database-level guard
-- is due before the coach may write plan changes.

-- planned_workouts -----------------------------------------------------------

alter table public.planned_workouts
  add column original_distance_m integer check (original_distance_m > 0);

comment on column public.planned_workouts.original_distance_m is
  'The plan''s own distance while the day has been made lighter, else null. '
  'Both lighter fractions are taken off this rather than off the current '
  'distance, so -40% after -20% does not compound, and "Restore planned '
  'distance" has a number to restore without reading the event log.';

-- plan_events ----------------------------------------------------------------

-- Existing move and undo rows get the same before/after shape, so the whole
-- history stays undoable and readable by one code path. The flat from/to keys
-- are left in place, here and in move_planned_workout below: they are what
-- "Recent changes" reads to name the two days, and removing them would be a
-- rewrite of history for no gain.
--
-- `not payload ? 'before'` makes this idempotent, and `payload ? 'from'`
-- skips any row that never carried a move at all.
update public.plan_events
   set payload = payload || jsonb_build_object(
         'before', jsonb_build_object(
           'planned_date', payload ->> 'from',
           'week_index', (payload ->> 'from_week')::int,
           'day_slot', (payload ->> 'from_slot')::int
         ),
         'after', jsonb_build_object(
           'planned_date', payload ->> 'to',
           'week_index', (payload ->> 'to_week')::int,
           'day_slot', (payload ->> 'to_slot')::int
         )
       )
 where kind in ('move_workout', 'undo_move')
   and payload ? 'from'
   and not payload ? 'before';

-- move_planned_workout -------------------------------------------------------

-- Replaced to add before/after to the payload. The signature, the checks and
-- the flat payload keys are unchanged, so no caller and no reader changes.
create or replace function public.move_planned_workout(
  p_workout_id uuid,
  p_to_date date,
  p_overrides text[] default '{}'::text[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_workout public.planned_workouts;
  v_to_week smallint;
  v_to_slot smallint;
  v_event_id uuid;
begin
  if v_user is null then
    raise exception 'move_planned_workout: no signed-in user'
      using errcode = '42501';
  end if;

  select * into v_workout
    from public.planned_workouts
   where id = p_workout_id
     for update;

  if not found then
    raise exception 'move_planned_workout: no such planned workout'
      using errcode = 'P0002';
  end if;

  if v_workout.status <> 'planned' then
    raise exception 'move_planned_workout: the workout is %, not planned',
      v_workout.status using errcode = 'P0001';
  end if;

  if v_workout.planned_date = p_to_date then
    raise exception 'move_planned_workout: the workout is already on %', p_to_date
      using errcode = 'P0001';
  end if;

  -- Week 1 starts 2026-10-19, which is PLAN_START in src/lib/plan/dates.ts.
  v_to_week := 1 + floor((p_to_date - date '2026-10-19') / 7.0);

  if v_to_week not between 1 and 78 then
    raise exception 'move_planned_workout: % is outside the 78 plan weeks', p_to_date
      using errcode = 'P0001';
  end if;

  select s.slot into v_to_slot
    from (values (0::smallint), (1::smallint)) as s (slot)
   where not exists (
     select 1
       from public.planned_workouts as other
      where other.user_id = v_user
        and other.planned_date = p_to_date
        and other.day_slot = s.slot
        and other.id <> v_workout.id
   )
   order by s.slot
   limit 1;

  if v_to_slot is null then
    raise exception 'move_planned_workout: % already holds two workouts', p_to_date
      using errcode = 'P0001';
  end if;

  update public.planned_workouts
     set planned_date = p_to_date,
         week_index = v_to_week,
         day_slot = v_to_slot
   where id = v_workout.id;

  insert into public.plan_events (user_id, kind, source, status, payload)
  values (
    v_user,
    'move_workout',
    'user',
    'accepted',
    jsonb_build_object(
      'workout_id', v_workout.id,
      'from', v_workout.planned_date,
      'from_week', v_workout.week_index,
      'from_slot', v_workout.day_slot,
      'to', p_to_date,
      'to_week', v_to_week,
      'to_slot', v_to_slot,
      'overrides', to_jsonb(coalesce(p_overrides, '{}'::text[])),
      -- The three columns this change touched, which is all undo restores.
      'before', jsonb_build_object(
        'planned_date', v_workout.planned_date,
        'week_index', v_workout.week_index,
        'day_slot', v_workout.day_slot
      ),
      'after', jsonb_build_object(
        'planned_date', p_to_date,
        'week_index', v_to_week,
        'day_slot', v_to_slot
      )
    )
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- set_workout_notes ----------------------------------------------------------

-- The trimming here is not a second copy of a rule: it is the column's
-- invariant. normaliseNotes in src/lib/plan/notes.ts does the same thing so
-- the form and the character count agree with what will be stored, but this
-- is what guarantees that "no notes" is null and never the empty string --
-- otherwise undo could restore a difference the athlete never made.
create function public.set_workout_notes(
  p_workout_id uuid,
  p_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_workout public.planned_workouts;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_event_id uuid;
begin
  if v_user is null then
    raise exception 'set_workout_notes: no signed-in user'
      using errcode = '42501';
  end if;

  select * into v_workout
    from public.planned_workouts
   where id = p_workout_id
     for update;

  if not found then
    raise exception 'set_workout_notes: no such planned workout'
      using errcode = 'P0002';
  end if;

  -- MAX_NOTES_LENGTH in src/lib/plan/notes.ts. Counted after trimming, so
  -- trailing whitespace is never what pushes a note over.
  if length(v_notes) > 2000 then
    raise exception 'set_workout_notes: a note is at most 2000 characters'
      using errcode = 'P0001';
  end if;

  -- Null-safe, so saving a blank field over a column that is already null is
  -- refused rather than becoming the one undoable event.
  if v_notes is not distinct from v_workout.notes then
    raise exception 'set_workout_notes: the notes are unchanged'
      using errcode = 'P0001';
  end if;

  update public.planned_workouts
     set notes = v_notes
   where id = v_workout.id;

  insert into public.plan_events (user_id, kind, source, status, payload)
  values (
    v_user,
    'edit_notes',
    'user',
    'accepted',
    jsonb_build_object(
      'workout_id', v_workout.id,
      'before', jsonb_build_object('notes', v_workout.notes),
      'after', jsonb_build_object('notes', v_notes)
    )
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function public.set_workout_notes(uuid, text) is
  'Replaces a planned workout''s notes and records the change as a plan_events '
  'row. Trims, stores null for an empty note, refuses one over 2000 '
  'characters and refuses a save that changes nothing.';

-- set_workout_status ---------------------------------------------------------

-- No date check, deliberately. Done and skipped are exactly what a session in
-- the past needs, and a session marked wrongly must stay correctable however
-- long ago it was. validateStatus in src/lib/plan/status.ts says the same.
create function public.set_workout_status(
  p_workout_id uuid,
  p_to text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_workout public.planned_workouts;
  v_event_id uuid;
begin
  if v_user is null then
    raise exception 'set_workout_status: no signed-in user'
      using errcode = '42501';
  end if;

  -- Checked here rather than left to the column constraint, so the client
  -- gets a sentence instead of a constraint name it cannot read.
  if p_to not in ('planned', 'completed', 'skipped') then
    raise exception 'set_workout_status: % is not a status', p_to
      using errcode = 'P0001';
  end if;

  select * into v_workout
    from public.planned_workouts
   where id = p_workout_id
     for update;

  if not found then
    raise exception 'set_workout_status: no such planned workout'
      using errcode = 'P0002';
  end if;

  if p_to is not distinct from v_workout.status then
    raise exception 'set_workout_status: the session is already %', p_to
      using errcode = 'P0001';
  end if;

  update public.planned_workouts
     set status = p_to
   where id = v_workout.id;

  insert into public.plan_events (user_id, kind, source, status, payload)
  values (
    v_user,
    'set_status',
    'user',
    'accepted',
    jsonb_build_object(
      'workout_id', v_workout.id,
      'before', jsonb_build_object('status', v_workout.status),
      'after', jsonb_build_object('status', p_to)
    )
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function public.set_workout_status(uuid, text) is
  'Moves a planned workout to another status and records the change as a '
  'plan_events row. Any of the three statuses, on any date -- done and '
  'skipped are what a past session needs. Refuses the status it already has.';

-- lighten_planned_workout ----------------------------------------------------

-- Takes the metres rather than the fraction. The rounding to the nearest half
-- kilometre, the 1 km floor and what each percentage is taken of are
-- lightenedDistance in src/lib/plan/lighten.ts, tested there, and the Server
-- Action computes the number from the row it just read. A PL/pgSQL copy of
-- that arithmetic would be a second definition of it, free to round
-- differently from the number the athlete was shown on the button.
--
-- What this enforces instead is the invariant that makes the missing ceiling
-- check safe: a lighter day is strictly lighter, so this path can never raise
-- a week's total however it is called.
create function public.lighten_planned_workout(
  p_workout_id uuid,
  p_to_distance_m integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_workout public.planned_workouts;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_original integer;
  v_event_id uuid;
begin
  if v_user is null then
    raise exception 'lighten_planned_workout: no signed-in user'
      using errcode = '42501';
  end if;

  select * into v_workout
    from public.planned_workouts
   where id = p_workout_id
     for update;

  if not found then
    raise exception 'lighten_planned_workout: no such planned workout'
      using errcode = 'P0002';
  end if;

  if v_workout.status <> 'planned' then
    raise exception 'lighten_planned_workout: the workout is %, not planned',
      v_workout.status using errcode = 'P0001';
  end if;

  if v_workout.planned_date < v_today then
    raise exception 'lighten_planned_workout: % has passed',
      v_workout.planned_date using errcode = 'P0001';
  end if;

  if v_workout.target_distance_m is null then
    raise exception 'lighten_planned_workout: the workout has no distance'
      using errcode = 'P0001';
  end if;

  -- MIN_LIGHT_DISTANCE_M in src/lib/plan/lighten.ts.
  if p_to_distance_m < 1000 then
    raise exception 'lighten_planned_workout: a session is at least 1 km'
      using errcode = 'P0001';
  end if;

  if p_to_distance_m >= v_workout.target_distance_m then
    raise exception
      'lighten_planned_workout: % m is not lighter than the % m planned',
      p_to_distance_m, v_workout.target_distance_m using errcode = 'P0001';
  end if;

  -- Set once, by the first lightening, and left alone by the second: the
  -- plan's own number, which is what both fractions are taken off and what
  -- restore puts back.
  v_original := coalesce(v_workout.original_distance_m, v_workout.target_distance_m);

  update public.planned_workouts
     set target_distance_m = p_to_distance_m,
         original_distance_m = v_original
   where id = v_workout.id;

  insert into public.plan_events (user_id, kind, source, status, payload)
  values (
    v_user,
    'lighten_workout',
    'user',
    'accepted',
    jsonb_build_object(
      'workout_id', v_workout.id,
      'before', jsonb_build_object(
        'target_distance_m', v_workout.target_distance_m,
        'original_distance_m', v_workout.original_distance_m
      ),
      'after', jsonb_build_object(
        'target_distance_m', p_to_distance_m,
        'original_distance_m', v_original
      )
    )
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function public.lighten_planned_workout(uuid, integer) is
  'Reduces a planned workout''s distance and records the change as a '
  'plan_events row. Refuses a past date, a non-planned status, anything under '
  '1 km and anything that is not strictly lighter -- so this path can never '
  'raise a week''s total. The fractions and the rounding are '
  'lightenedDistance in src/lib/plan/lighten.ts.';

-- restore_planned_distance ---------------------------------------------------

-- The one action here that can raise a week's distance. The 60 km ceiling is
-- checked by validateRestore in src/lib/plan/lighten.ts, which the Server
-- Action re-runs against freshly read rows; it is NOT checked below. What is
-- enforced is that the number put back is the plan's own, read from the row
-- rather than taken from a parameter, so no caller can restore to more than
-- the plan ever asked for.
create function public.restore_planned_distance(p_workout_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_workout public.planned_workouts;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_event_id uuid;
begin
  if v_user is null then
    raise exception 'restore_planned_distance: no signed-in user'
      using errcode = '42501';
  end if;

  select * into v_workout
    from public.planned_workouts
   where id = p_workout_id
     for update;

  if not found then
    raise exception 'restore_planned_distance: no such planned workout'
      using errcode = 'P0002';
  end if;

  if v_workout.status <> 'planned' then
    raise exception 'restore_planned_distance: the workout is %, not planned',
      v_workout.status using errcode = 'P0001';
  end if;

  if v_workout.planned_date < v_today then
    raise exception 'restore_planned_distance: % has passed',
      v_workout.planned_date using errcode = 'P0001';
  end if;

  if v_workout.original_distance_m is null then
    raise exception 'restore_planned_distance: this day was not made lighter'
      using errcode = 'P0001';
  end if;

  update public.planned_workouts
     set target_distance_m = v_workout.original_distance_m,
         original_distance_m = null
   where id = v_workout.id;

  insert into public.plan_events (user_id, kind, source, status, payload)
  values (
    v_user,
    'restore_distance',
    'user',
    'accepted',
    jsonb_build_object(
      'workout_id', v_workout.id,
      'before', jsonb_build_object(
        'target_distance_m', v_workout.target_distance_m,
        'original_distance_m', v_workout.original_distance_m
      ),
      'after', jsonb_build_object(
        'target_distance_m', v_workout.original_distance_m,
        'original_distance_m', null
      )
    )
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function public.restore_planned_distance(uuid) is
  'Puts a lightened workout''s planned distance back and records the change '
  'as a plan_events row. The number comes from original_distance_m, never '
  'from a parameter. The 60 km ceiling is checked by validateRestore in '
  'src/lib/plan/lighten.ts, not here.';

-- undo_plan_event ------------------------------------------------------------

-- Replaced: the same signature and the same stack discipline, now driven by
-- the before/after snapshots instead of three named move columns.
--
-- Undo is a stack. The target is the caller's newest UNDOABLE event: an
-- accepted event they made themselves which is not itself an undo. So after
-- undoing the second of two changes the first becomes undoable again, and an
-- undo cannot be undone -- there is no redo, which is consistent with
-- plan_events having no delete policy.
create or replace function public.undo_plan_event(p_event_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_event public.plan_events;
  v_latest uuid;
  v_workout public.planned_workouts;
  v_before jsonb;
  v_after jsonb;
  v_undo_id uuid;
begin
  if v_user is null then
    raise exception 'undo_plan_event: no signed-in user'
      using errcode = '42501';
  end if;

  -- Looked up first, and separately from the stack query below, so that an
  -- event which is simply not undoable gets its own message instead of all
  -- the failures collapsing into "not the latest".
  select * into v_event
    from public.plan_events
   where id = p_event_id;

  if not found then
    raise exception 'undo_plan_event: no such plan event'
      using errcode = 'P0002';
  end if;

  if v_event.kind in ('undo_move', 'undo_change') then
    raise exception 'undo_plan_event: an undo cannot itself be undone'
      using errcode = 'P0001';
  end if;

  if v_event.status = 'undone' then
    raise exception 'undo_plan_event: % is already undone', p_event_id
      using errcode = 'P0001';
  end if;

  -- A coach proposal is accepted or rejected, not undone, and a proposal
  -- nobody accepted changed nothing to put back.
  if v_event.source <> 'user' or v_event.status <> 'accepted' then
    raise exception 'undo_plan_event: a % % event cannot be undone',
      v_event.status, v_event.kind using errcode = 'P0001';
  end if;

  v_before := v_event.payload -> 'before';
  v_after := v_event.payload -> 'after';

  if v_before is null or v_after is null then
    raise exception 'undo_plan_event: that change did not record what it replaced'
      using errcode = 'P0001';
  end if;

  select id into v_latest
    from public.plan_events
   where user_id = v_user
     and source = 'user'
     and status = 'accepted'
     and kind not in ('undo_move', 'undo_change')
   order by seq desc
   limit 1;

  -- Undo is only ever offered for the newest undoable change, so any other id
  -- is a stale request. It is refused rather than quietly redirected at a
  -- different event: "undo this" must never undo something else.
  if v_latest is distinct from p_event_id then
    raise exception 'undo_plan_event: % is not the latest undoable change',
      p_event_id using errcode = 'P0001';
  end if;

  select * into v_workout
    from public.planned_workouts
   where id = (v_event.payload ->> 'workout_id')::uuid
     for update;

  if not found then
    raise exception 'undo_plan_event: the workout no longer exists'
      using errcode = 'P0002';
  end if;

  -- The only precondition: the workout is still as this event left it, in the
  -- columns this event touched. Every key present in `after` is compared, and
  -- nothing else is -- whether something else has since taken a seat this
  -- event vacated is irrelevant, which is exactly why
  -- (user_id, planned_date, day_slot) is not unique.
  --
  -- IS DISTINCT FROM throughout: `after` may legitimately hold a null, for a
  -- note that was cleared or an original_distance_m that a restore set back to
  -- null, and `<>` would make that comparison unknown and refuse the undo.
  if (v_after ? 'planned_date'
      and v_workout.planned_date
          is distinct from (v_after ->> 'planned_date')::date)
     or (v_after ? 'week_index'
         and v_workout.week_index
             is distinct from (v_after ->> 'week_index')::smallint)
     or (v_after ? 'day_slot'
         and v_workout.day_slot
             is distinct from (v_after ->> 'day_slot')::smallint)
     or (v_after ? 'status'
         and v_workout.status is distinct from (v_after ->> 'status'))
     or (v_after ? 'notes'
         and v_workout.notes is distinct from (v_after ->> 'notes'))
     or (v_after ? 'target_distance_m'
         and v_workout.target_distance_m
             is distinct from (v_after ->> 'target_distance_m')::integer)
     or (v_after ? 'original_distance_m'
         and v_workout.original_distance_m
             is distinct from (v_after ->> 'original_distance_m')::integer)
  then
    raise exception 'undo_plan_event: the workout has changed since that change'
      using errcode = 'P0001';
  end if;

  -- A fixed column list, each assignment keyed on the key being present. No
  -- dynamic SQL: a payload must never be able to name the column it sets.
  update public.planned_workouts
     set planned_date = case
           when v_before ? 'planned_date'
             then (v_before ->> 'planned_date')::date
           else planned_date end,
         week_index = case
           when v_before ? 'week_index'
             then (v_before ->> 'week_index')::smallint
           else week_index end,
         day_slot = case
           when v_before ? 'day_slot'
             then (v_before ->> 'day_slot')::smallint
           else day_slot end,
         status = case
           when v_before ? 'status' then v_before ->> 'status'
           else status end,
         notes = case
           when v_before ? 'notes' then v_before ->> 'notes'
           else notes end,
         target_distance_m = case
           when v_before ? 'target_distance_m'
             then (v_before ->> 'target_distance_m')::integer
           else target_distance_m end,
         original_distance_m = case
           when v_before ? 'original_distance_m'
             then (v_before ->> 'original_distance_m')::integer
           else original_distance_m end
   where id = v_workout.id;

  -- The snapshots swapped, so an undo reads like any other change and
  -- `undone_kind` tells "Recent changes" what was put back.
  insert into public.plan_events
    (user_id, kind, source, status, payload, reverts_event_id)
  values (
    v_user,
    'undo_change',
    'user',
    'accepted',
    jsonb_build_object(
      'workout_id', v_workout.id,
      'undone_kind', v_event.kind,
      'before', v_after,
      'after', v_before
    ),
    v_event.id
  )
  returning id into v_undo_id;

  -- The column grant is `update (status)` only, so this must touch nothing
  -- else -- and there is no updated_at trigger on plan_events to touch it for
  -- us. A broader update would fail at run time, not at migration time.
  update public.plan_events set status = 'undone' where id = v_event.id;

  return v_undo_id;
end;
$$;

comment on function public.undo_plan_event(uuid) is
  'Undoes one change by writing its payload''s `before` snapshot back over a '
  'fixed column list. Only the caller''s newest accepted non-undo event, so '
  'undo is a stack. Fails if the workout is no longer as that event left it. '
  'No redo.';

-- Privileges -----------------------------------------------------------------
-- Creating a function grants execute to public by default.

revoke execute on function public.set_workout_notes(uuid, text) from public, anon;
revoke execute on function public.set_workout_status(uuid, text) from public, anon;
revoke execute on function public.lighten_planned_workout(uuid, integer)
  from public, anon;
revoke execute on function public.restore_planned_distance(uuid) from public, anon;

grant execute on function public.set_workout_notes(uuid, text) to authenticated;
grant execute on function public.set_workout_status(uuid, text) to authenticated;
grant execute on function public.lighten_planned_workout(uuid, integer)
  to authenticated;
grant execute on function public.restore_planned_distance(uuid) to authenticated;
