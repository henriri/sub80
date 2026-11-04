import { formatDayLabel, paceRangeLabel, zoneLabel, type StoredWorkout } from "@/lib/plan";

type WorkoutListProps = {
  items: readonly StoredWorkout[];
  /** The athlete's current VDOT: every pace shown is derived from it. */
  vdot: number;
};

const row = [
  "flex flex-col gap-stack-sm rounded-surface bg-surface p-inset-md",
  "border-(length:--border-width-default) border-default",
].join(" ");

const badge = "rounded-control bg-raised px-inline-sm font-code text-small";

function Distance({ metres }: { metres: number | null }) {
  if (metres === null) return null;
  return <span className="text-small text-secondary">{(metres / 1000).toFixed(1)} km</span>;
}

/** A plain list of planned workouts. No calendar: one line per session. */
export function WorkoutList({ items, vdot }: WorkoutListProps) {
  return (
    <ol className="flex flex-col gap-stack-sm">
      {items.map((workout) => (
        <li key={workout.id} className={row}>
          <div className="flex items-baseline justify-between gap-inline-md">
            <span className="font-strong text-body">{formatDayLabel(workout.planned_date)}</span>
            <Distance metres={workout.target_distance_m} />
          </div>
          <span className="text-body">
            {workout.title}
            {workout.is_key ? (
              <>
                {" "}
                <span aria-hidden="true">★</span>
                <span className="sr-only">(key session)</span>
              </>
            ) : null}
          </span>
          {workout.pace_zone ? (
            <span className="flex items-center gap-inline-sm text-small text-secondary">
              <span className={badge}>
                {workout.pace_zone}
                <span className="sr-only"> {zoneLabel(workout.pace_zone)}</span>
              </span>
              {paceRangeLabel(workout.pace_zone, vdot)}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
