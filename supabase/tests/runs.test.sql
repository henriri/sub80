-- public.log_run, public.update_run and public.delete_run.
-- Run with `supabase test db` against the LOCAL stack only.
-- All data is synthetic and rolled back at the end.
--
-- A separate file from moves.test.sql, rls.test.sql and workout-detail.test.sql
-- on purpose: those are about the plan, this one is about the runs recorded
-- against it, and a failure here should not shift unrelated assertion numbers.
--
-- Two things shape every date below.
--
-- First, log_run refuses a date in the future, and "the future" moves with the
-- clock on whatever day this suite runs. So every run is logged on a date that
-- is already past and always will be: November 2026 for the plan sessions,
-- which sit in plan week 4 (week 1 began 2026-10-19).
--
-- Second, that is also why the daylight-saving cases use 2026-03-29 and
-- 2026-10-25 rather than the 2027 transitions: a 2027 date is still in the
-- future and log_run would refuse it. These are the same two transitions one
-- year earlier -- Europe/Paris springs forward on 2026-03-29 and falls back on
-- 2026-10-25 -- and a run needs no plan week, so a date before the plan starts
-- is fine. The 2027 dates are covered in src/lib/runs/rules.test.ts, where
-- `today` is an argument rather than the clock.
--
-- Runs carry no sequence column and every row inserted in one transaction
-- shares the same now(), so a logged run is never selected by "the newest
-- one". Each is given a distinct distance_m instead and read back by it.

begin;

select plan(61);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'runner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'runner-b@example.test');

-- A VDOT that is not the 47 default, so a snapshot can be told apart from it.
update public.profiles set vdot = 52.3
 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.planned_workouts
  (id, user_id, planned_date, kind, title, week_index, day_slot, status,
   target_distance_m, pace_zone) values
  -- The session the editing section links, unlinks and relinks.
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2026-11-10', 'easy', 'A Tuesday easy', 4, 0, 'planned', 10000, 'E'),
  -- Deleted from without the reset flag, so its status must survive.
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2026-11-11', 'threshold', 'A Wednesday threshold', 4, 0, 'planned', 12000, 'T'),
  -- Already done before any run is logged against it.
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2026-11-12', 'easy', 'A Thursday easy', 4, 0, 'completed', 9000, 'E'),
  -- Skipped, then a run turns up after all.
  ('a0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2026-11-13', 'easy', 'A Friday easy', 4, 0, 'skipped', 8000, 'S'),
  -- No pace zone at all, which the generator never emits but the column allows.
  ('a0000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '2026-11-09', 'long', 'A Monday long', 4, 0, 'planned', 20000, null);

-- A row owned by user B, to prove row-level security does the ownership work.
insert into public.planned_workouts
  (id, user_id, planned_date, kind, title, week_index, day_slot,
   target_distance_m, pace_zone) values
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '2026-11-10', 'easy', 'B Tuesday easy', 4, 0, 10000, 'E');

-- A run owned by user B, for the cross-user cases on update and delete.
insert into public.activities
  (id, user_id, started_at, distance_m, duration_s) values
  ('b0000000-0000-0000-0000-0000000000a1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '2026-11-10T11:00:00Z', 7000, 2400);

-- Act as user A ---------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- log_run, unlinked -----------------------------------------------------------

select lives_ok(
  $$select public.log_run(
      p_date => '2026-11-14', p_time => null,
      p_distance_m => 10000, p_duration_s => 3300)$$,
  'the owner can log a run of their own with no session and no start time'
);

select is(
  (select duration_s from public.activities where distance_m = 10000),
  3300,
  'the duration is stored as given'
);

select is(
  (select start_time_known from public.activities where distance_m = 10000),
  false,
  'start_time_known is false when no start time was entered'
);

select is(
  (select started_at from public.activities where distance_m = 10000),
  '2026-11-14 11:00:00+00'::timestamptz,
  'a run with no start time is stored at midday Europe/Paris, which is 11:00 UTC in November'
);

select is(
  (select source from public.activities where distance_m = 10000),
  'manual',
  'source defaults to manual'
);

select ok(
  (select planned_pace_zone is null and vdot_used is null
     from public.activities where distance_m = 10000),
  'both snapshots are null on a run with no session, because they would describe nothing'
);

select lives_ok(
  $$select public.log_run(
      p_date => '2026-11-15', p_time => '07:30',
      p_distance_m => 10100, p_duration_s => 3000,
      p_notes => '  Felt strong.  ')$$,
  'a run can carry a start time and a note'
);

select is(
  (select start_time_known from public.activities where distance_m = 10100),
  true,
  'start_time_known is true when a start time was entered'
);

select is(
  (select started_at from public.activities where distance_m = 10100),
  '2026-11-15 06:30:00+00'::timestamptz,
  'the entered start time is read as Europe/Paris'
);

select is(
  (select notes from public.activities where distance_m = 10100),
  'Felt strong.',
  'the note is stored trimmed'
);

select lives_ok(
  $$select public.log_run(
      p_date => '2026-11-14', p_time => null,
      p_distance_m => 10150, p_duration_s => 3000, p_notes => '   ')$$,
  'a blank note is accepted'
);

select is(
  (select notes from public.activities where distance_m = 10150),
  null,
  'a blank note is stored as null, so "no note" has one representation'
);

-- The snapshots, taken inside SQL --------------------------------------------

select lives_ok(
  $$select public.log_run(
      p_date => '2026-11-10', p_time => null,
      p_distance_m => 10200, p_duration_s => 3200,
      p_avg_hr => 148, p_hr_source => 'strap', p_rpe => 4,
      p_planned_workout_id => 'a0000000-0000-0000-0000-000000000001')$$,
  'a run can be linked to a planned session'
);

select is(
  (select planned_pace_zone from public.activities where distance_m = 10200),
  'E',
  'planned_pace_zone is copied from the session by SQL, never supplied by the caller'
);

select is(
  (select vdot_used from public.activities where distance_m = 10200),
  52.3::numeric(4,1),
  'vdot_used is the profile''s configured VDOT, not the 47 default and not a parameter'
);

select is(
  (select status from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000001'),
  'completed',
  'linking a run marks a planned session completed'
);

select lives_ok(
  $$select public.log_run(
      p_date => '2026-11-13', p_time => null,
      p_distance_m => 10300, p_duration_s => 2600,
      p_planned_workout_id => 'a0000000-0000-0000-0000-000000000004')$$,
  'a run can be logged against a session that was skipped'
);

select is(
  (select status from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000004'),
  'completed',
  'a skipped session becomes completed when a run turns up after all'
);

select lives_ok(
  $$select public.log_run(
      p_date => '2026-11-12', p_time => null,
      p_distance_m => 10400, p_duration_s => 2700,
      p_planned_workout_id => 'a0000000-0000-0000-0000-000000000003')$$,
  'a second run can be logged against a session that is already completed'
);

select is(
  (select status from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000003'),
  'completed',
  'a completed session stays completed rather than being written again'
);

select lives_ok(
  $$select public.log_run(
      p_date => '2026-11-09', p_time => null,
      p_distance_m => 10500, p_duration_s => 6000,
      p_planned_workout_id => 'a0000000-0000-0000-0000-000000000005')$$,
  'a run can be linked to a session that has no pace zone'
);

select ok(
  (select planned_pace_zone is null and vdot_used = 52.3
     from public.activities where distance_m = 10500),
  'a session with no zone snapshots a null zone, and the VDOT is still recorded'
);

-- Daylight saving -------------------------------------------------------------

select lives_ok(
  $$select public.log_run(
      p_date => '2026-03-29', p_time => null,
      p_distance_m => 10600, p_duration_s => 3000)$$,
  'a run can be logged on the day the clocks go forward'
);

select is(
  (select started_at from public.activities where distance_m = 10600),
  '2026-03-29 10:00:00+00'::timestamptz,
  'midday on the spring-forward day is 10:00 UTC, because Paris is already on summer time'
);

select lives_ok(
  $$select public.log_run(
      p_date => '2026-10-25', p_time => null,
      p_distance_m => 10700, p_duration_s => 3000)$$,
  'a run can be logged on the day the clocks go back'
);

select is(
  (select started_at from public.activities where distance_m = 10700),
  '2026-10-25 11:00:00+00'::timestamptz,
  'midday on the fall-back day is 11:00 UTC, because Paris is back on winter time'
);

select is(
  (select count(*) from public.activities
    where distance_m in (10600, 10700)
      and (started_at at time zone 'Europe/Paris')::time <> time '12:00'),
  0::bigint,
  'both daylight-saving runs read back as midday in Paris, whatever the offset was'
);

-- What log_run refuses --------------------------------------------------------

select throws_ok(
  $$select public.log_run(
      p_date => '2030-01-01', p_time => null,
      p_distance_m => 11900, p_duration_s => 3000)$$,
  'P0001', null,
  'a run cannot be dated in the future'
);

select throws_ok(
  $$select public.log_run(
      p_date => '2026-11-14', p_time => null,
      p_distance_m => 11901, p_duration_s => 3000, p_avg_hr => 150)$$,
  'P0001', null,
  'a heart rate without its source is refused, because the two are never mixed'
);

select throws_ok(
  $$select public.log_run(
      p_date => '2026-11-14', p_time => null,
      p_distance_m => 11902, p_duration_s => 3000, p_hr_source => 'strap')$$,
  'P0001', null,
  'a heart-rate source without a reading is refused, because it describes nothing'
);

select throws_ok(
  $$select public.log_run(
      p_date => '2026-11-14', p_time => null,
      p_distance_m => 11903, p_duration_s => 3000,
      p_avg_hr => 150, p_hr_source => 'optical')$$,
  'P0001', null,
  'a heart-rate source outside strap and wrist is refused'
);

select throws_ok(
  $$select public.log_run(
      p_date => '2026-11-14', p_time => null,
      p_distance_m => 11904, p_duration_s => 3000,
      p_avg_hr => 300, p_hr_source => 'strap')$$,
  'P0001', null,
  'an impossible heart rate is refused with a sentence, not a constraint name'
);

select throws_ok(
  $$select public.log_run(
      p_date => '2026-11-14', p_time => null,
      p_distance_m => 11905, p_duration_s => 3000, p_rpe => 11)$$,
  'P0001', null,
  'an effort outside 1 to 10 is refused'
);

select throws_ok(
  $$select public.log_run(
      p_date => '2026-11-10', p_time => null,
      p_distance_m => 11906, p_duration_s => 3000,
      p_planned_workout_id => 'b0000000-0000-0000-0000-000000000001')$$,
  'P0002', null,
  'another user''s session is not found rather than refused, so no run can link across users'
);

select is(
  (select count(*) from public.activities where distance_m between 11900 and 11999),
  0::bigint,
  'not one of those refusals left a row behind'
);

-- update_run ------------------------------------------------------------------

-- Changed now, so a re-snapshot can be told from a snapshot left alone.
reset role;
update public.profiles set vdot = 55.1
 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$select public.update_run(
      p_activity_id => (select id from public.activities where distance_m = 10200),
      p_date => '2026-11-10', p_time => null,
      p_distance_m => 10250, p_duration_s => 3200,
      p_avg_hr => 148, p_hr_source => 'strap', p_rpe => 5,
      p_planned_workout_id => 'a0000000-0000-0000-0000-000000000001')$$,
  'the owner can edit their own run'
);

select is(
  (select rpe from public.activities where distance_m = 10250),
  5::smallint,
  'the edited effort is stored'
);

select ok(
  (select planned_pace_zone = 'E' and vdot_used = 52.3::numeric(4,1)
     from public.activities where distance_m = 10250),
  'an edit that keeps the same session leaves both snapshots alone, so a note never re-dates the target'
);

select lives_ok(
  $$select public.update_run(
      p_activity_id => (select id from public.activities where distance_m = 10250),
      p_date => '2026-11-10', p_time => null,
      p_distance_m => 10260, p_duration_s => 3200,
      p_planned_workout_id => null)$$,
  'a run can be unlinked from its session'
);

select ok(
  (select planned_pace_zone is null and vdot_used is null
     from public.activities where distance_m = 10260),
  'unlinking clears both snapshots, because without a session they describe nothing'
);

select lives_ok(
  $$select public.update_run(
      p_activity_id => (select id from public.activities where distance_m = 10260),
      p_date => '2026-11-10', p_time => null,
      p_distance_m => 10270, p_duration_s => 3200,
      p_planned_workout_id => 'a0000000-0000-0000-0000-000000000001')$$,
  'a run can be linked again'
);

select is(
  (select planned_pace_zone from public.activities where distance_m = 10270),
  'E',
  'relinking snapshots the zone again'
);

select is(
  (select vdot_used from public.activities where distance_m = 10270),
  55.1::numeric(4,1),
  'relinking snapshots the VDOT as it is NOW, which is what makes it a snapshot and not a copy'
);

select throws_ok(
  $$select public.update_run(
      p_activity_id => 'b0000000-0000-0000-0000-0000000000a1',
      p_date => '2026-11-10', p_time => null,
      p_distance_m => 7100, p_duration_s => 2400)$$,
  'P0002', null,
  'another user''s run is not found rather than refused'
);

select throws_ok(
  $$select public.update_run(
      p_activity_id => (select id from public.activities where distance_m = 10270),
      p_date => '2030-01-01', p_time => null,
      p_distance_m => 10270, p_duration_s => 3200)$$,
  'P0001', null,
  'an edit cannot move a run into the future either'
);

-- delete_run ------------------------------------------------------------------

select throws_ok(
  $$select public.delete_run(
      (select id from public.activities where distance_m = 10000), true)$$,
  'P0001', null,
  'asking to reset the session of a run that has none is refused, so the checkbox cannot lie'
);

select is(
  (select count(*) from public.activities where distance_m = 10000),
  1::bigint,
  'that refusal deleted nothing'
);

select lives_ok(
  $$select public.delete_run(
      (select id from public.activities where distance_m = 10300), true)$$,
  'a run can be deleted and its session put back in one go'
);

select is(
  (select status from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000004'),
  'planned',
  'the session the deleted run was the only one for is back to planned'
);

select is(
  (select count(*) from public.activities where distance_m = 10300),
  0::bigint,
  'the run itself is gone'
);

select lives_ok(
  $$select public.log_run(
      p_date => '2026-11-11', p_time => null,
      p_distance_m => 11000, p_duration_s => 3000,
      p_planned_workout_id => 'a0000000-0000-0000-0000-000000000002')$$,
  'a run is logged against the Wednesday threshold'
);

select lives_ok(
  $$select public.delete_run(
      (select id from public.activities where distance_m = 11000), false)$$,
  'a run can be deleted without touching its session'
);

select is(
  (select status from public.planned_workouts
    where id = 'a0000000-0000-0000-0000-000000000002'),
  'completed',
  'without the flag the session keeps the status it had, which is the athlete''s to change'
);

select lives_ok(
  $$select public.log_run(
      p_date => '2026-11-09', p_time => null,
      p_distance_m => 11100, p_duration_s => 6100,
      p_planned_workout_id => 'a0000000-0000-0000-0000-000000000005')$$,
  'a second run is logged against the Monday long'
);

select throws_ok(
  $$select public.delete_run(
      (select id from public.activities where distance_m = 10500), true)$$,
  'P0001', null,
  'resetting is refused while another run is still linked to that session'
);

select is(
  (select count(*) from public.activities where distance_m = 10500),
  1::bigint,
  'that refusal deleted nothing either, because the whole function is one transaction'
);

select throws_ok(
  $$select public.delete_run('b0000000-0000-0000-0000-0000000000a1', false)$$,
  'P0002', null,
  'another user''s run cannot be deleted'
);

-- A run is a fact ------------------------------------------------------------

select is(
  (select count(*) from public.plan_events),
  0::bigint,
  'nothing in this file wrote a plan event: logging a run is a fact, not a plan change, and is off the undo stack'
);

-- Act as anon -----------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', null, true);
set local role anon;

select throws_ok(
  $$select public.log_run(
      p_date => '2026-11-14', p_time => null,
      p_distance_m => 5000, p_duration_s => 1800)$$,
  '42501', null,
  'anon cannot execute log_run'
);

select throws_ok(
  $$select public.update_run(
      p_activity_id => '00000000-0000-4000-8000-000000000001',
      p_date => '2026-11-14', p_time => null,
      p_distance_m => 5000, p_duration_s => 1800)$$,
  '42501', null,
  'anon cannot execute update_run'
);

select throws_ok(
  $$select public.delete_run('00000000-0000-4000-8000-000000000001', false)$$,
  '42501', null,
  'anon cannot execute delete_run'
);

reset role;

select * from finish();
rollback;
