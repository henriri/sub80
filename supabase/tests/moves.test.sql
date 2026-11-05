-- public.move_planned_workout and public.undo_plan_event.
-- Run with `supabase test db` against the LOCAL stack only.
-- All data is synthetic and rolled back at the end.
--
-- A separate file from rls.test.sql on purpose: that one is about policies,
-- this one is about two functions, and a failure here should not shift twenty
-- unrelated assertion numbers.
--
-- Plan week 12 starts Monday 2027-01-04, which is why every date below is in
-- that week unless a case needs otherwise.

begin;

select plan(32);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'runner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'runner-b@example.test');

-- User A's week 12. Monday, Wednesday and a full Friday (both slots).
insert into public.planned_workouts
  (id, user_id, planned_date, kind, title, week_index, day_slot, status) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2027-01-04', 'easy', 'A Monday easy', 12, 0, 'planned'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2027-01-06', 'threshold', 'A Wednesday threshold', 12, 0, 'planned'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2027-01-08', 'easy', 'A Friday first', 12, 0, 'planned'),
  ('a0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2027-01-08', 'easy', 'A Friday second', 12, 1, 'planned'),
  ('a0000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2027-01-10', 'long', 'A Sunday long', 12, 0, 'planned'),
  ('a0000000-0000-0000-0000-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2027-01-05', 'easy', 'A already done', 12, 0, 'completed');

-- A row owned by user B, to prove row-level security does the ownership work.
insert into public.planned_workouts
  (id, user_id, planned_date, kind, title, week_index, day_slot) values
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '2027-01-04', 'easy', 'B Monday easy', 12, 0);

-- Act as user A ---------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- A plain move -----------------------------------------------------------------

select lives_ok(
  $$select public.move_planned_workout(
      'a0000000-0000-0000-0000-000000000001'::uuid, '2027-01-07'::date,
      array['double_day']::text[])$$,
  'the owner can move their own planned workout'
);

select is(
  (select planned_date from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  '2027-01-07'::date,
  'the move writes the new date'
);

select is(
  (select week_index from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  12::smallint,
  'a move inside the week keeps week_index'
);

select is(
  (select day_slot from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  0::smallint,
  'an empty destination day gives slot 0'
);

select is(
  (select count(*)::int from public.plan_events
    where kind = 'move_workout' and source = 'user' and status = 'accepted'),
  1,
  'the move is recorded as one accepted user event'
);

select is(
  (select payload - 'workout_id' from public.plan_events where kind = 'move_workout'),
  jsonb_build_object(
    'from', '2027-01-04', 'from_week', 12, 'from_slot', 0,
    'to', '2027-01-07', 'to_week', 12, 'to_slot', 0,
    'overrides', jsonb_build_array('double_day')
  ),
  'the payload carries both states and the overrides'
);

select is(
  (select payload ->> 'workout_id' from public.plan_events where kind = 'move_workout'),
  'a0000000-0000-0000-0000-000000000001',
  'the payload names the workout'
);

-- Slots and week boundaries ----------------------------------------------------

select lives_ok(
  $$select public.move_planned_workout(
      'a0000000-0000-0000-0000-000000000002'::uuid, '2027-01-07'::date)$$,
  'a second workout may join a day that holds one'
);

select is(
  (select day_slot from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000002'),
  1::smallint,
  'the second workout on a day takes slot 1'
);

select throws_ok(
  $$select public.move_planned_workout(
      'a0000000-0000-0000-0000-000000000005'::uuid, '2027-01-07'::date)$$,
  'P0001', null,
  'a third workout on a day is refused'
);

select lives_ok(
  $$select public.move_planned_workout(
      'a0000000-0000-0000-0000-000000000005'::uuid, '2027-01-11'::date)$$,
  'a workout may move across a week boundary'
);

select is(
  (select week_index from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000005'),
  13::smallint,
  'Sunday to the following Monday recomputes week_index'
);

-- Refusals ---------------------------------------------------------------------

select throws_ok(
  $$select public.move_planned_workout(
      'a0000000-0000-0000-0000-000000000003'::uuid, '2026-10-12'::date)$$,
  'P0001', null,
  'a destination before plan week 1 is refused'
);

select throws_ok(
  $$select public.move_planned_workout(
      'a0000000-0000-0000-0000-000000000003'::uuid, '2028-04-24'::date)$$,
  'P0001', null,
  'a destination after race week is refused'
);

select throws_ok(
  $$select public.move_planned_workout(
      'a0000000-0000-0000-0000-000000000003'::uuid, '2027-01-08'::date)$$,
  'P0001', null,
  'a move to the day it is already on is refused'
);

select throws_ok(
  $$select public.move_planned_workout(
      'a0000000-0000-0000-0000-000000000009'::uuid, '2027-01-07'::date)$$,
  'P0001', null,
  'a completed workout cannot be moved'
);

-- Row-level security makes B's row invisible, so this is not found rather than
-- refused -- which is a stronger guarantee than an ownership check of our own.
select throws_ok(
  $$select public.move_planned_workout(
      'b0000000-0000-0000-0000-000000000001'::uuid, '2027-01-07'::date)$$,
  'P0002', null,
  'another user''s workout cannot be moved'
);

-- Undo -------------------------------------------------------------------------

-- The day the Sunday long run came from is deliberately refilled first, so the
-- undo below has to succeed with both of its old day's slots taken by others.
insert into public.planned_workouts
  (user_id, planned_date, kind, title, week_index, day_slot) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027-01-10', 'easy', 'Squatter one', 12, 0),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027-01-10', 'easy', 'Squatter two', 12, 1);

select lives_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'move_workout' and status <> 'undone'
       order by seq desc limit 1))$$,
  'the latest move can be undone even though its old day is now full'
);

select is(
  (select planned_date from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000005'),
  '2027-01-10'::date,
  'undo restores the date'
);

select is(
  (select week_index from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000005'),
  12::smallint,
  'undo restores week_index'
);

select is(
  (select day_slot from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000005'),
  0::smallint,
  'undo restores day_slot, sharing it with the squatter'
);

select is(
  (select count(*)::int from public.plan_events
    where kind = 'undo_move'
      and reverts_event_id is not null
      and status = 'accepted'),
  1,
  'undo inserts an undo_move event pointing at the original'
);

select is(
  (select e.status
     from public.plan_events as e
     join public.plan_events as u on u.reverts_event_id = e.id
    where u.kind = 'undo_move'),
  'undone',
  'undo marks the original event undone'
);

-- Undo is a stack --------------------------------------------------------------

-- At this point the undoable moves, newest first, are: the Wednesday
-- threshold onto 2027-01-07, then the Monday easy onto 2027-01-07.
select throws_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'move_workout' and status <> 'undone'
       order by seq asc limit 1))$$,
  'P0001', null,
  'an older move cannot be undone before a newer one'
);

select lives_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'move_workout' and status <> 'undone'
       order by seq desc limit 1))$$,
  'undoing the newest move makes the one before it undoable'
);

select lives_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'move_workout' and status <> 'undone'
       order by seq desc limit 1))$$,
  'the move before it can then be undone in turn'
);

select is(
  (select planned_date from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  '2027-01-04'::date,
  'unwinding the stack puts the first-moved workout back'
);

-- No redo, and nothing is undone twice.
select throws_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events where kind = 'move_workout'
       order by seq desc limit 1))$$,
  'P0001', null,
  'an already undone move cannot be undone again'
);

select throws_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events where kind = 'undo_move'
       order by seq desc limit 1))$$,
  'P0001', null,
  'an undo cannot itself be undone'
);

-- A move whose workout has since moved again ----------------------------------

select public.move_planned_workout(
  'a0000000-0000-0000-0000-000000000003'::uuid, '2027-01-09'::date);
select public.move_planned_workout(
  'a0000000-0000-0000-0000-000000000003'::uuid, '2027-01-07'::date);

-- The older of the two is not the latest undoable event, so it is refused for
-- that reason before the state precondition is ever reached. Both answers are
-- correct; this pins the one the stack rule gives.
select throws_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'move_workout' and status <> 'undone'
       order by seq asc limit 1))$$,
  'P0001', null,
  'a superseded move is refused rather than silently reapplied'
);

-- Act as anon -----------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', null, true);
set local role anon;

select throws_ok(
  $$select public.move_planned_workout(
      'a0000000-0000-0000-0000-000000000003'::uuid, '2027-01-07'::date)$$,
  '42501', null,
  'anon cannot execute move_planned_workout'
);

select throws_ok(
  $$select public.undo_plan_event('a0000000-0000-0000-0000-0000000000e1'::uuid)$$,
  '42501', null,
  'anon cannot execute undo_plan_event'
);

reset role;

select * from finish();
rollback;
