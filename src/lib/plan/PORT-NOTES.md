# Plan port notes

The modules in this directory are a port of the plan core from the first app
(plain JavaScript). `__fixtures__/plan-golden.json` is that code's output,
generated once in Node, and `generator.test.ts` asserts the port deep-equals it
for all 78 weeks. Changing a table or a share here fails that test on purpose:
regenerate the fixture only when the plan is meant to change.

## Deliberate differences

- **Dates are computed in UTC.** The legacy code parsed `'YYYY-MM-DD'` into a
  local `Date` at 12:00 to dodge daylight saving. `dates.ts` uses `Date.UTC`
  and `getUTC*` instead, which cannot shift a day whatever the machine's zone
  is. Verified: all 78 week starts and all 357 session dates are unchanged.
- **No `_planCache`.** `buildWeek` only mutates objects it has just created, so
  it is deterministic without memoising and each caller gets its own copy.
- **`zoneRange` cannot return `null`.** The key is typed, so an unknown zone is
  a compile error rather than a runtime `null`.
- **Mixed-type table rows are typed tuples** (`[title, kind, key]`), same data.

## Not ported yet

Still in the legacy file, out of scope for the plan-seed phase. Nothing below
is lost: it is written down here so the next phase can pick it up.

### Cross training (`xtrain`)

Deferred by decision. `buildWeek` no longer returns an `xtrain` array and the
golden fixture has that key stripped. Cross training is not running volume and
does not belong in `planned_workouts` as it stands, so it needs its own column
set (minutes, not kilometres) or its own table. The legacy table, verbatim —
`[dow, kind, minutes, title]`, dow 0 = Monday:

```js
const XT = {
  P0: [[0,'strength',30,'Strength A: adductors, core'],[2,'bike',40,'Easy bike (optional)'],[4,'strength',25,'Strength B: hips, glutes']],
  P1: [[0,'strength',30,'Strength A: adductors, core'],[2,'bike',45,'Easy bike (optional)'],[4,'strength',25,'Strength B: hips, glutes']],
  P2: [[0,'strength',30,'Strength A: adductors, core'],[2,'bike',50,'Easy bike (optional)'],[4,'strength',25,'Strength B: hips, glutes']],
  P3: [[0,'strength',30,'Strength A: adductors, core'],[2,'bike',60,'Easy bike'],[4,'strength',25,'Strength B: hips, glutes']],
  P4: [[0,'strength',30,'Strength A: adductors, core'],[2,'bike',60,'Easy bike'],[4,'strength',25,'Strength B: hips, glutes']],
  P5: [[0,'strength',30,'Strength A: adductors, core'],[0,'aqua',40,'Aqua-jog (low-impact volume)'],[2,'bike',75,'Easy bike'],[4,'strength',25,'Strength B: hips, glutes']],
  P6: [[0,'strength',30,'Strength A: adductors, core'],[0,'aqua',40,'Aqua-jog (low-impact volume)'],[2,'bike',60,'Easy bike'],[4,'strength',25,'Strength B: hips, glutes']],
};
```

Note the P5 and P6 entries put two sessions on dow 0, so a straight port into a
table with a unique `(date, title)` index is fine, but one with a unique
`(date)` index is not.

### Planned VDOT curve

`VDOT_CURVE` and `plannedVdotOn(date)`: the fitness the plan assumes over time,
interpolated between anchor points. Needed by the "fitness gap of 1.5 VDOT for
two weeks" coach trigger, not by plan generation.

```js
const VDOT_CURVE = [['2026-10-19',47],['2026-12-10',49],['2027-03-28',52],
                    ['2027-06-27',55],['2027-10-17',58],['2028-04-16',59]];
```

### Milestones

`MILESTONES`: the 30′ time trial (week 8), the 5k time trial (week 36), the 5k
PR attempt (17:25, week 52), the 10k PR attempt (36:45, week 58) and the half
marathon (80:00). The sessions themselves are in the generated plan already;
what is missing is the target times and the "resets paces" semantics.

### `parseDur`

Parses `'m:ss'`, `'h:mm:ss'` and bare minutes into seconds. Belongs with the
activity-logging form, where there is input to parse.

### `RACE_LABEL` and `RACES`

Both ported: `zoneRange` needs `RACES`, and the workout list labels the `5K`,
`10K` and `HM` keys with `RACE_LABEL`. `M` (marathon) comes along with them but
no session uses it.
