-- Moving a planned workout to another day, and undoing the last move.
--
-- Row-level security is UNCHANGED, and both functions are SECURITY INVOKER so
-- that it applies to them. That is the whole design: the function runs with
-- the caller's own privileges, so another user's workout is simply not visible
-- to the SELECT below and `not found` fires. No ownership test of our own is
-- needed, and none could be stronger than the policies.
--
-- The existing grants are exactly what these need: `insert` on plan_events,
-- whose insert policy is satisfied because user_id comes from auth.uid() and
-- never from a parameter, and `update (status)` on plan_events, which is why
-- the status update at the end of the undo touches nothing else. plan_events
-- has no set_updated_at trigger, so nothing writes a second column behind us.
--
-- What is checked here and what is not. These functions enforce what keeps the
-- data coherent: ownership, a plan week inside 1 to 78, a planned status, and
-- two workouts a day -- that last one because allocating the slot *is* the
-- capacity check, and it is the one genuine race.
--
-- The 60 km ceiling and the five-runs-a-week limit are NOT checked here. They
-- live in validateMove (src/lib/plan/moves.ts), which the Server Action
-- re-runs against freshly read rows before calling this. CLAUDE.md puts
-- measurement and validation in tested plain code, and the limits need the
-- same rounding and unit semantics as the message the athlete reads; a
-- PL/pgSQL twin would be a second definition of a safety limit, free to drift
-- from the first. The cost is recorded under "Known limits" in CLAUDE.md: a
-- direct call to move_planned_workout can exceed the ceiling, and a
-- database-level guard is due before the coach may write plan changes.

-- move_planned_workout -------------------------------------------------------

create function public.move_planned_workout(
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

  -- Row-level security scopes this to the caller's own rows, so another
  -- user's workout is not found rather than refused.
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
  -- date minus date is whole days. floor, not trunc: before the plan the
  -- difference is negative, and the range check below must see week 0 or less
  -- rather than a value rounded towards zero.
  v_to_week := 1 + floor((p_to_date - date '2026-10-19') / 7.0);

  -- Checked here rather than left to the column constraint, so the client
  -- gets a sentence instead of a constraint name it cannot read.
  if v_to_week not between 1 and 78 then
    raise exception 'move_planned_workout: % is outside the 78 plan weeks', p_to_date
      using errcode = 'P0001';
  end if;

  -- The next free slot on the destination day: 0 if it is free, else 1. The
  -- workout itself is excluded, so a slot it already holds cannot block it.
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

  -- from/to ARE the previous and the new state, so there is no separate
  -- "previous_*" copy: it would be the same three values twice, free to drift,
  -- and undo would have to pick a winner.
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
      'overrides', to_jsonb(coalesce(p_overrides, '{}'::text[]))
    )
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function public.move_planned_workout(uuid, date, text[]) is
  'Moves a planned workout to another day and records the change as a '
  'plan_events row. Enforces ownership, a plan week in 1..78, a planned '
  'status and two workouts a day. The 60 km and five-runs limits are '
  'enforced by validateMove in src/lib/plan/moves.ts, not here.';

-- Creating a function grants execute to public by default.
revoke execute on function public.move_planned_workout(uuid, date, text[])
  from public, anon;
grant execute on function public.move_planned_workout(uuid, date, text[])
  to authenticated;

-- undo_plan_event ------------------------------------------------------------

-- Undo is a stack. The target is the caller's newest UNDOABLE event: a
-- move_workout that is not already undone, ordered by seq. undo_move rows are
-- skipped, so after undoing the second of two moves the first becomes
-- undoable again. There is no redo: an undo_move cannot itself be undone,
-- which is consistent with plan_events having no delete policy.
create function public.undo_plan_event(p_event_id uuid)
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
  v_undo_id uuid;
begin
  if v_user is null then
    raise exception 'undo_plan_event: no signed-in user'
      using errcode = '42501';
  end if;

  -- Looked up first, and separately from the stack query below, so that an
  -- event which is simply not undoable gets its own message instead of all
  -- three failures collapsing into "not the latest".
  select * into v_event
    from public.plan_events
   where id = p_event_id;

  if not found then
    raise exception 'undo_plan_event: no such plan event'
      using errcode = 'P0002';
  end if;

  if v_event.kind <> 'move_workout' then
    raise exception 'undo_plan_event: a % event cannot be undone', v_event.kind
      using errcode = 'P0001';
  end if;

  if v_event.status = 'undone' then
    raise exception 'undo_plan_event: % is already undone', p_event_id
      using errcode = 'P0001';
  end if;

  select id into v_latest
    from public.plan_events
   where user_id = v_user
     and kind = 'move_workout'
     and status <> 'undone'
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

  -- The only precondition: the workout is still where this event left it.
  -- Whether something else has since taken the old seat is irrelevant, which
  -- is exactly why (user_id, planned_date, day_slot) is not unique.
  if v_workout.planned_date <> (v_event.payload ->> 'to')::date
     or v_workout.day_slot <> (v_event.payload ->> 'to_slot')::smallint
     or v_workout.status <> 'planned' then
    raise exception 'undo_plan_event: the workout has changed since that move'
      using errcode = 'P0001';
  end if;

  update public.planned_workouts
     set planned_date = (v_event.payload ->> 'from')::date,
         week_index = (v_event.payload ->> 'from_week')::smallint,
         day_slot = (v_event.payload ->> 'from_slot')::smallint
   where id = v_workout.id;

  insert into public.plan_events
    (user_id, kind, source, status, payload, reverts_event_id)
  values (
    v_user,
    'undo_move',
    'user',
    'accepted',
    jsonb_build_object(
      'workout_id', v_workout.id,
      'from', v_event.payload ->> 'to',
      'from_week', (v_event.payload ->> 'to_week')::int,
      'from_slot', (v_event.payload ->> 'to_slot')::int,
      'to', v_event.payload ->> 'from',
      'to_week', (v_event.payload ->> 'from_week')::int,
      'to_slot', (v_event.payload ->> 'from_slot')::int,
      'overrides', '[]'::jsonb
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
  'Undoes a move, restoring planned_date, week_index and day_slot. Only the '
  'caller''s newest undoable move_workout event, so undo is a stack. Fails if '
  'the workout is no longer where the event left it. No redo.';

revoke execute on function public.undo_plan_event(uuid) from public, anon;
grant execute on function public.undo_plan_event(uuid) to authenticated;
