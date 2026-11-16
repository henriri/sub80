import { KindBadge } from "@/components/calendar/KindBadge";
import { formatFullDate, formatKm, statusWord, weekTitle } from "@/lib/calendar";
import {
  paceRangeLabel,
  phaseOf,
  zoneLabel,
  zoneUse,
  type WorkoutDetail,
} from "@/lib/plan";

type WorkoutFactsProps = {
  workout: WorkoutDetail;
  /** The athlete's current VDOT: every pace shown is derived from it. */
  vdot: number;
};

/** A row, or nothing when the session has no such fact. */
type Fact = { term: string; value: React.ReactNode; note?: string };

const row = "flex flex-col gap-stack-sm md:flex-row md:items-baseline md:gap-inline-md";

function facts(workout: WorkoutDetail, vdot: number): Fact[] {
  const zone = workout.pace_zone;
  const inPlan = weekTitle(workout.week_index);

  return [
    { term: "Kind", value: <KindBadge kind={workout.kind} /> },
    { term: "Day", value: formatFullDate(workout.planned_date) },
    {
      term: "Planned distance",
      value: workout.target_distance_m === null ? "–" : formatKm(workout.target_distance_m),
      // Only while the day is lighter, and it names the number restore puts
      // back, so "Restore planned distance" is not a button into the unknown.
      note:
        workout.original_distance_m === null
          ? undefined
          : `Made lighter. The plan asks for ${formatKm(workout.original_distance_m)}.`,
    },
    zone === null
      ? { term: "Pace", value: "No pace target." }
      : {
          term: `${zoneLabel(zone)} pace`,
          value: paceRangeLabel(zone, vdot),
          // Every pace is derived from the current VDOT at display time, which
          // is why the column target_pace_s_per_km stays null.
          note: zoneUse(zone),
        },
    ...(workout.strides
      ? [{ term: "Strides", value: "Finishes with strides." } satisfies Fact]
      : []),
    {
      term: "Plan",
      value: inPlan ?? `Week ${workout.week_index}`,
      note: inPlan === null ? undefined : phaseOf(workout.week_index).goal,
    },
    { term: "Status", value: statusWord(workout.status) },
  ];
}

/**
 * Everything the generator decided about one session, which a card has no
 * room for: the pace window its zone means at today's fitness, what that zone
 * is for, the phase and the week it belongs to.
 *
 * A description list, so a screen reader reads each fact with its own name
 * rather than as a run of unlabelled lines.
 */
export function WorkoutFacts({ workout, vdot }: WorkoutFactsProps) {
  return (
    <dl className="flex flex-col gap-stack-md">
      {facts(workout, vdot).map((fact) => (
        <div key={fact.term} className="flex flex-col gap-stack-sm">
          <div className={row}>
            {/*
              No fixed width on the term: that would be a new component token
              for a column of labels, and the layout pass that would earn it
              has not happened yet. Ragged, readable, and tokens only.
            */}
            <dt className="font-strong text-small text-secondary">{fact.term}</dt>
            <dd className="text-body">{fact.value}</dd>
          </div>
          {fact.note === undefined ? null : (
            <p className="text-small text-secondary">{fact.note}</p>
          )}
        </div>
      ))}
    </dl>
  );
}
