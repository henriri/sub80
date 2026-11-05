-- Two workouts a day, in a fixed order, and a monotonic ordering for plan
-- events so "the latest change" is unambiguous.
--
-- Row-level security is UNCHANGED. Both tables keep RLS enabled and the
-- policies from the initial migration already cover these columns, since they
-- key on user_id only. The table-level grants cover them too, and plan_events
-- keeps its column-level `update (status)` grant: seq below is an identity
-- column, so no client can write it whatever the grants say.
--
-- Why a day may hold two workouts at all: a double day is a real training
-- pattern, and the calendar already renders a list per day. What it must never
-- hold is three, or two in the same position.

-- planned_workouts -----------------------------------------------------------

-- Added with a default and without the check, so the backfill below can run
-- first. With the check inline, a day that already holds two workouts would
-- put both in slot 0 and still pass, leaving the ordering ambiguous.
alter table public.planned_workouts
  add column day_slot smallint not null default 0;

-- Renumber every day that holds more than one workout. The order is the one
-- src/lib/calendar/view-model.ts sorted by until now -- key sessions first,
-- then title -- so nothing on screen reshuffles when the view model starts
-- reading this column instead. `id` breaks a remaining tie so the result is
-- deterministic rather than dependent on physical row order.
--
-- Only rows whose slot actually changes are written, so the
-- planned_workouts_set_updated_at trigger leaves the rest alone.
with ranked as (
  select
    id,
    (row_number() over (
      partition by user_id, planned_date
      order by is_key desc, title, id
    ) - 1)::smallint as slot
  from public.planned_workouts
)
update public.planned_workouts as w
   set day_slot = ranked.slot
  from ranked
 where ranked.id = w.id
   and ranked.slot <> w.day_slot;

-- Added after the backfill. A day holding three or more workouts fails this
-- migration, which is the behaviour wanted: it would mean the data already
-- broke a rule the app has had since the calendar shipped, and silently
-- discarding the third is worse than refusing to migrate.
alter table public.planned_workouts
  add constraint planned_workouts_day_slot_check check (day_slot in (0, 1));

comment on column public.planned_workouts.day_slot is
  'Order within the day: 0 first, 1 second. Deliberately NOT unique per '
  '(user_id, planned_date, day_slot): undoing a move restores the slot the '
  'workout came from verbatim and must not fail because something else has '
  'since taken that seat. The two-per-day rule is enforced by '
  'public.move_planned_workout and by validateMove in src/lib/plan/moves.ts.';

-- plan_events ----------------------------------------------------------------

-- created_at defaults to now(), which is identical for two events written in
-- one transaction, so it cannot decide which event is the latest. Undo depends
-- on that question having one answer, so order by an identity column instead.
--
-- `generated always` means no client can supply or change it, which is why the
-- existing table-level insert grant needs no narrowing.
alter table public.plan_events
  add column seq bigint generated always as identity;

comment on column public.plan_events.seq is
  'Insertion order, for "the latest change". created_at cannot answer that: '
  'it is now(), identical within a transaction.';

-- Undo reads the caller's newest undoable event, so the index is per user and
-- descending. plan_events_user_created_idx still carries the history list.
create unique index plan_events_user_seq_idx
  on public.plan_events (user_id, seq desc);
