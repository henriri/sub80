-- Row-level security for the initial schema.
-- Run with `supabase test db` against the LOCAL stack only.
-- All data is synthetic and rolled back at the end.

begin;

select plan(24);

-- Two synthetic users. The on_auth_user_created trigger creates their profiles.
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'runner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'runner-b@example.test');

-- Rows owned by user B.
insert into public.planned_workouts (id, user_id, planned_date, kind, title, week_index, pace_zone) values
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2027-01-04', 'easy', 'B run', 12, 'E');
insert into public.activities (user_id, started_at, distance_m, duration_s, hr_source) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2027-01-04 07:00+01', 8000, 2700, 'wrist');
insert into public.plan_events (id, user_id, kind, source) values
  ('b0000000-0000-0000-0000-0000000000e1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'swap_workout', 'coach');

-- Row owned by user A.
insert into public.planned_workouts (user_id, planned_date, kind, title, week_index, pace_zone) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027-01-05', 'long', 'A run', 12, 'E');

select is(
  (select count(*)::int from public.profiles),
  2,
  'a profile is created for each new auth user'
);

-- Act as user A ---------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is((select count(*)::int from public.profiles), 1, 'A sees only their own profile');
select is((select count(*)::int from public.planned_workouts), 1, 'A sees only their own planned workouts');
select is((select count(*)::int from public.activities), 0, 'A sees none of B''s activities');
select is((select count(*)::int from public.plan_events), 0, 'A sees none of B''s plan events');

select throws_ok(
  $$insert into public.planned_workouts (user_id, planned_date, kind, title, week_index)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2027-01-06', 'easy', 'planted', 12)$$,
  '42501', null,
  'A cannot insert a planned workout for B'
);

select throws_ok(
  $$insert into public.activities (user_id, planned_workout_id, started_at, distance_m, duration_s, hr_source)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b0000000-0000-0000-0000-000000000001',
            '2027-01-05 07:00+01', 5000, 1500, 'strap')$$,
  '23503', null,
  'A cannot link an activity to B''s planned workout'
);

select throws_ok(
  $$insert into public.activities (user_id, started_at, distance_m, duration_s, hr_source)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027-01-05 07:00+01', 5000, 1500, 'chest')$$,
  '23514', null,
  'hr_source accepts only strap or wrist'
);

-- The unique index behind "Generate my plan": a second insert of the same date
-- and title is refused, so a double click cannot duplicate the plan.
select throws_ok(
  $$insert into public.planned_workouts (user_id, planned_date, kind, title, week_index)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027-01-05', 'long', 'A run', 12)$$,
  '23505', null,
  'the same date and title cannot be planned twice'
);

select throws_ok(
  $$insert into public.planned_workouts (user_id, planned_date, kind, title, week_index)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027-01-07', 'tempo', 'A tempo', 12)$$,
  '23514', null,
  'kind accepts only the kinds the plan generator produces'
);

select lives_ok(
  $$insert into public.activities (user_id, started_at, distance_m, duration_s, avg_hr, hr_source)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027-01-05 07:00+01', 5000, 1500, 150, 'strap')$$,
  'A can insert their own activity'
);

select lives_ok(
  $$insert into public.plan_events (id, user_id, kind, source)
    values ('a0000000-0000-0000-0000-0000000000e1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'swap_workout', 'user')$$,
  'A can insert their own plan event'
);

select throws_ok(
  $$insert into public.plan_events (user_id, kind, source, reverts_event_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'undo', 'user', 'b0000000-0000-0000-0000-0000000000e1')$$,
  '23503', null,
  'A cannot revert B''s plan event'
);

select throws_ok(
  $$delete from public.plan_events where id = 'a0000000-0000-0000-0000-0000000000e1'$$,
  '42501', null,
  'plan events cannot be deleted'
);

select throws_ok(
  $$update public.plan_events set payload = '{"edited": true}'
    where id = 'a0000000-0000-0000-0000-0000000000e1'$$,
  '42501', null,
  'only the status of a plan event can be updated'
);

select lives_ok(
  $$update public.plan_events set status = 'accepted'
    where id = 'a0000000-0000-0000-0000-0000000000e1'$$,
  'A can change the status of their own plan event'
);

select throws_ok(
  $$insert into public.profiles (id) values (gen_random_uuid())$$,
  '42501', null,
  'clients cannot insert profiles'
);

-- These run without error but must change nothing (RLS filters B's rows out).
select lives_ok(
  $$update public.planned_workouts set title = 'hacked'
    where id = 'b0000000-0000-0000-0000-000000000001'$$,
  'A updating B''s planned workout is a no-op'
);
select lives_ok(
  $$delete from public.planned_workouts where id = 'b0000000-0000-0000-0000-000000000001'$$,
  'A deleting B''s planned workout is a no-op'
);
select lives_ok(
  $$update public.profiles set display_name = 'hacked'
    where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'A updating B''s profile is a no-op'
);

-- Back to the owner role to check what really happened -----------------------

reset role;

select is(
  (select title from public.planned_workouts where id = 'b0000000-0000-0000-0000-000000000001'),
  'B run',
  'B''s planned workout is unchanged and still exists'
);
select is(
  (select count(*)::int from public.planned_workouts where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  1,
  'B still has exactly one planned workout'
);
select is(
  (select display_name from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  null,
  'B''s profile is unchanged'
);

-- Anonymous visitors ----------------------------------------------------------

set local role anon;

select throws_ok(
  $$select * from public.planned_workouts$$,
  '42501', null,
  'anon cannot read planned workouts'
);

reset role;

select * from finish();

rollback;
