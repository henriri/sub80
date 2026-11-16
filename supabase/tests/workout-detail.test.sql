-- public.set_workout_notes, public.set_workout_status,
-- public.lighten_planned_workout, public.restore_planned_distance, and the
-- generic public.undo_plan_event over all of them.
-- Run with `supabase test db` against the LOCAL stack only.
-- All data is synthetic and rolled back at the end.
--
-- A separate file from moves.test.sql and rls.test.sql on purpose: those are
-- about two functions and about policies, this one is about four more and the
-- undo that covers them, and a failure here should not shift unrelated
-- assertion numbers.
--
-- Undo is a global stack per user, so each change is undone where it is made,
-- while it is still the newest event. The one section that needs an older
-- event is the stack section, which builds its own pair.
--
-- Plan week 12 starts Monday 2027-01-04, which is why the dates that must be
-- in the future are in that week. The two deliberately past dates are in week
-- 1, which began 2026-10-19.

begin;

select plan(50);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'runner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'runner-b@example.test');

insert into public.planned_workouts
  (id, user_id, planned_date, kind, title, week_index, day_slot, status,
   target_distance_m, notes) values
  -- The session every distance case is run against.
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2027-01-06', 'easy', 'A Wednesday easy', 12, 0, 'planned', 14000, null),
  -- Marked done during the status section, then used as a non-planned row.
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2027-01-08', 'threshold', 'A Friday threshold', 12, 0, 'planned', 12000, null),
  -- Carries a note from the start, for the stack section.
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2027-01-04', 'easy', 'A Monday easy', 12, 0, 'planned', 10000, 'Old note'),
  -- A past day, still planned: done and skipped must work on it, lighter and
  -- restore must not.
  ('a0000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2026-10-20', 'easy', 'A past easy', 1, 0, 'planned', 8000, null),
  -- No distance at all, which the generator never emits but the column allows.
  ('a0000000-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2027-01-07', 'rest', 'A no distance', 12, 0, 'planned', null, null);

-- A row owned by user B, to prove row-level security does the ownership work.
insert into public.planned_workouts
  (id, user_id, planned_date, kind, title, week_index, day_slot,
   target_distance_m) values
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '2027-01-04', 'easy', 'B Monday easy', 12, 0, 9000);

-- Act as user A ---------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- set_workout_notes -----------------------------------------------------------

select lives_ok(
  $$select public.set_workout_notes(
      'a0000000-0000-0000-0000-000000000001'::uuid, '  Felt good.  ')$$,
  'the owner can write notes on their own planned workout'
);

select is(
  (select notes from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  'Felt good.',
  'the note is stored trimmed'
);

select is(
  (select payload -> 'before' ->> 'notes' from public.plan_events
    where kind = 'edit_notes' order by seq desc limit 1),
  null,
  'before records the absent note as a null, with the key present'
);

select is(
  (select payload -> 'after' ->> 'notes' from public.plan_events
    where kind = 'edit_notes' order by seq desc limit 1),
  'Felt good.',
  'after records the note that was written'
);

select throws_ok(
  $$select public.set_workout_notes(
      'a0000000-0000-0000-0000-000000000001'::uuid, 'Felt good.')$$,
  'P0001', null,
  'saving the same note again is refused, so it cannot bury an undo'
);

select throws_ok(
  $$select public.set_workout_notes(
      'a0000000-0000-0000-0000-000000000001'::uuid, repeat('x', 2001))$$,
  'P0001', null,
  'a note over 2000 characters is refused'
);

select throws_ok(
  $$select public.set_workout_notes(
      'b0000000-0000-0000-0000-000000000001'::uuid, 'Not mine.')$$,
  'P0002', null,
  'another user''s workout is not found rather than refused'
);

select lives_ok(
  $$select public.set_workout_notes(
      'a0000000-0000-0000-0000-000000000001'::uuid, '    ')$$,
  'a blank note clears the column'
);

select is(
  (select notes from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  null,
  'cleared means null, not an empty string'
);

-- Undoing that clear is the null-safe case: `after` holds "notes": null, and a
-- plain <> comparison against it would be unknown and refuse the undo.
select lives_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'edit_notes' and status = 'accepted'
       order by seq desc limit 1))$$,
  'a change that cleared a note can be undone'
);

select is(
  (select notes from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  'Felt good.',
  'undo puts the previous text back'
);

select is(
  (select payload ->> 'undone_kind' from public.plan_events
    where kind = 'undo_change' order by seq desc limit 1),
  'edit_notes',
  'the undo event says which kind of change it reversed'
);

select is(
  (select e.status from public.plan_events as e
    join public.plan_events as u on u.reverts_event_id = e.id
   where u.kind = 'undo_change'),
  'undone',
  'undo marks the original event undone'
);

select throws_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events where kind = 'undo_change'
       order by seq desc limit 1))$$,
  'P0001', null,
  'an undo cannot itself be undone'
);

-- set_workout_status ----------------------------------------------------------

select lives_ok(
  $$select public.set_workout_status(
      'a0000000-0000-0000-0000-000000000002'::uuid, 'completed')$$,
  'a planned session can be marked done'
);

select is(
  (select status from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000002'),
  'completed',
  'the status is written'
);

select throws_ok(
  $$select public.set_workout_status(
      'a0000000-0000-0000-0000-000000000002'::uuid, 'completed')$$,
  'P0001', null,
  'the status it already has is refused'
);

select throws_ok(
  $$select public.set_workout_status(
      'a0000000-0000-0000-0000-000000000002'::uuid, 'abandoned')$$,
  'P0001', null,
  'a status outside the three gets a sentence, not a constraint name'
);

-- The point of having no date check: a session that has been and gone is
-- exactly the one that needs marking.
select lives_ok(
  $$select public.set_workout_status(
      'a0000000-0000-0000-0000-000000000005'::uuid, 'skipped')$$,
  'a session in the past can be marked skipped'
);

select is(
  (select status from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000005'),
  'skipped',
  'the past session is skipped'
);

select lives_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'set_status' and status = 'accepted'
       order by seq desc limit 1))$$,
  'a status change can be undone'
);

select is(
  (select status from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000005'),
  'planned',
  'undo puts the previous status back'
);

-- lighten_planned_workout -----------------------------------------------------

select lives_ok(
  $$select public.lighten_planned_workout(
      'a0000000-0000-0000-0000-000000000001'::uuid, 11000)$$,
  'a planned day can be made lighter'
);

select is(
  (select target_distance_m from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  11000,
  'the lighter distance is written'
);

select is(
  (select original_distance_m from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  14000,
  'the plan''s own distance is kept'
);

select lives_ok(
  $$select public.lighten_planned_workout(
      'a0000000-0000-0000-0000-000000000001'::uuid, 8500)$$,
  'a lighter day can be made lighter again'
);

select is(
  (select target_distance_m from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  8500,
  'the second reduction is written'
);

select is(
  (select original_distance_m from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  14000,
  'the original is set once and not overwritten by the second reduction'
);

-- The invariant that makes the absent ceiling check safe here: this path can
-- never raise a week's total, however it is called.
select throws_ok(
  $$select public.lighten_planned_workout(
      'a0000000-0000-0000-0000-000000000001'::uuid, 11000)$$,
  'P0001', null,
  'a distance that is not strictly lighter is refused'
);

select throws_ok(
  $$select public.lighten_planned_workout(
      'a0000000-0000-0000-0000-000000000001'::uuid, 500)$$,
  'P0001', null,
  'anything under a kilometre is refused'
);

select throws_ok(
  $$select public.lighten_planned_workout(
      'a0000000-0000-0000-0000-000000000005'::uuid, 5000)$$,
  'P0001', null,
  'a past day cannot be made lighter'
);

select throws_ok(
  $$select public.lighten_planned_workout(
      'a0000000-0000-0000-0000-000000000006'::uuid, 5000)$$,
  'P0001', null,
  'a session with no distance cannot be made lighter'
);

select throws_ok(
  $$select public.lighten_planned_workout(
      'a0000000-0000-0000-0000-000000000002'::uuid, 5000)$$,
  'P0001', null,
  'a session that is done cannot be made lighter'
);

-- restore_planned_distance ----------------------------------------------------

select lives_ok(
  $$select public.restore_planned_distance(
      'a0000000-0000-0000-0000-000000000001'::uuid)$$,
  'the planned distance can be put back'
);

select is(
  (select target_distance_m from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  14000,
  'restore writes the plan''s own distance, not a parameter'
);

select is(
  (select original_distance_m from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  null,
  'restore clears the original, so the day is no longer lightened'
);

select throws_ok(
  $$select public.restore_planned_distance(
      'a0000000-0000-0000-0000-000000000001'::uuid)$$,
  'P0001', null,
  'a day that was not made lighter has nothing to restore'
);

-- The second null-safe case: this event's `after` holds
-- "original_distance_m": null, which the precondition must verify rather than
-- refuse.
select lives_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'restore_distance' and status = 'accepted'
       order by seq desc limit 1))$$,
  'a restore can be undone although its after snapshot holds a null'
);

select is(
  (select target_distance_m from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  8500,
  'undoing the restore makes the day lighter again'
);

select is(
  (select original_distance_m from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  14000,
  'undoing the restore puts the original back'
);

-- The stack, across kinds -----------------------------------------------------

-- Two changes of different kinds on one session, newest last.
select public.set_workout_status(
  'a0000000-0000-0000-0000-000000000003'::uuid, 'skipped');
select public.set_workout_notes(
  'a0000000-0000-0000-0000-000000000003'::uuid, 'Legs heavy.');

select throws_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'set_status' and status = 'accepted'
       order by seq desc limit 1))$$,
  'P0001', null,
  'an older change of another kind cannot be undone before a newer one'
);

select lives_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'edit_notes' and status = 'accepted'
       order by seq desc limit 1))$$,
  'the newest change can be undone whatever kind it is'
);

select lives_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'set_status' and status = 'accepted'
       order by seq desc limit 1))$$,
  'undoing it makes the change of another kind beneath it undoable'
);

select is(
  (select status from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000003'),
  'planned',
  'unwinding the stack across kinds puts the status back'
);

select throws_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'set_status' order by seq desc limit 1))$$,
  'P0001', null,
  'an already undone change cannot be undone again'
);

-- A workout changed since the event ------------------------------------------

-- Changed by a path that writes no event, which is the only way to reach the
-- state precondition rather than the stack rule.
select public.lighten_planned_workout(
  'a0000000-0000-0000-0000-000000000001'::uuid, 7000);

update public.planned_workouts
   set target_distance_m = 9000
 where id = 'a0000000-0000-0000-0000-000000000001';

select throws_ok(
  $$select public.undo_plan_event((
      select id from public.plan_events
       where kind = 'lighten_workout' and status = 'accepted'
       order by seq desc limit 1))$$,
  'P0001', null,
  'a workout that is no longer as the event left it is refused'
);

-- Act as anon -----------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', null, true);
set local role anon;

select throws_ok(
  $$select public.set_workout_notes(
      'a0000000-0000-0000-0000-000000000001'::uuid, 'Not yours.')$$,
  '42501', null,
  'anon cannot execute set_workout_notes'
);

select throws_ok(
  $$select public.set_workout_status(
      'a0000000-0000-0000-0000-000000000001'::uuid, 'skipped')$$,
  '42501', null,
  'anon cannot execute set_workout_status'
);

select throws_ok(
  $$select public.lighten_planned_workout(
      'a0000000-0000-0000-0000-000000000001'::uuid, 5000)$$,
  '42501', null,
  'anon cannot execute lighten_planned_workout'
);

select throws_ok(
  $$select public.restore_planned_distance(
      'a0000000-0000-0000-0000-000000000001'::uuid)$$,
  '42501', null,
  'anon cannot execute restore_planned_distance'
);

reset role;

select * from finish();
rollback;
