-- What the generated plan needs from planned_workouts, plus the athlete's
-- current VDOT on profiles.
--
-- Row-level security is UNCHANGED. Both tables keep RLS enabled and the
-- policies from the initial migration already cover these columns, since they
-- key on user_id only. The table-level grants cover them too.
--
-- planned_workouts is empty, so replacing the kind check and adding a NOT NULL
-- column without a default is safe.

-- planned_workouts -----------------------------------------------------------

-- The placeholder kinds (tempo, intervals, repetitions) are gone: these are the
-- kinds the generator in src/lib/plan actually produces. `rest` is allowed for
-- a day the coach may later clear, though the generator never emits it.
-- Dropped by its exact name, without IF EXISTS: if the name ever differs this
-- migration must fail rather than leave the old check in place next to the new
-- one, which would reject every kind that is not in both lists.
alter table public.planned_workouts
  drop constraint planned_workouts_kind_check;

alter table public.planned_workouts
  add constraint planned_workouts_kind_check
  check (kind in ('easy', 'long', 'hills', 'steady', 'sweet', 'threshold',
                  'interval', 'tt', 'race', 'rest'));

alter table public.planned_workouts
  add column week_index smallint not null check (week_index between 1 and 78),
  add column pace_zone text
    check (pace_zone in ('E', 'S', 'SS', 'T', 'I', 'R', '5K', '10K', 'HM')),
  add column strides boolean not null default false;

comment on column public.planned_workouts.week_index is
  'Plan week, 1 to 78. Week 1 starts 2026-10-19, week 78 holds the race.';
comment on column public.planned_workouts.pace_zone is
  'Zone key. Paces are computed from the athlete''s current VDOT at display '
  'time, which is why target_pace_s_per_km stays null.';
comment on column public.planned_workouts.strides is
  'The session finishes with strides.';

-- A double click on "Generate my plan" cannot create a second copy: the insert
-- is one statement, so the unique violation rolls the whole thing back.
create unique index planned_workouts_user_date_title_idx
  on public.planned_workouts (user_id, planned_date, title);

-- profiles -------------------------------------------------------------------

-- Current fitness, the single input to every displayed pace. 47 is where the
-- plan starts; a 1:20 half marathon is about 58.4. The range is a sanity
-- check, not a training rule.
alter table public.profiles
  add column vdot numeric(4,1) not null default 47
    check (vdot between 25 and 85);

comment on column public.profiles.vdot is
  'Daniels/Gilbert VDOT. Paces are derived from this at display time.';
