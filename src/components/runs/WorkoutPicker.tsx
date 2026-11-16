"use client";

import { useId } from "react";
import { joinClasses } from "@/components/calendar/styles";
import { formatKm } from "@/lib/calendar";
import { formatDayLabel, zoneLabel } from "@/lib/plan";
import type { LinkableWorkout } from "@/lib/runs";
import { choiceSurface } from "./styles";

type WorkoutPickerProps = {
  /** The sessions on offer, already narrowed to the run's date. */
  workouts: readonly LinkableWorkout[];
  /** The chosen session, or null for a run that stands alone. */
  value: string | null;
  onChange: (workoutId: string | null) => void;
  /** Said when the date has moved away from the session that is still linked. */
  farNotice: string | null;
};

/**
 * Which planned session this run was. Radio inputs, including an explicit
 * "no session" option.
 *
 * A radio list rather than a `select`: there are rarely more than four
 * candidates, each needs two lines to say what it is, and a native select can
 * show neither the status nor the distance. "No session" is a real option
 * rather than the absence of a choice, so clearing a link is one tap and the
 * group always has something checked.
 *
 * Every option says its STATUS. A session already marked completed usually
 * means a run is on it, and a skipped one is about to be un-skipped by this
 * run, so neither should be a surprise after the fact.
 */
const option = [
  "flex min-h-touch cursor-pointer flex-col justify-center gap-stack-sm",
  "px-(--choice-padding-x) py-(--choice-padding-y)",
  choiceSurface,
].join(" ");

/** A word for the status, in the athlete's vocabulary rather than the column's. */
function statusWord(status: string): string {
  switch (status) {
    case "completed":
      return "already done";
    case "skipped":
      return "skipped";
    default:
      return "planned";
  }
}

/** '10.0 km · Easy · planned', the second line of an option. */
function describe(workout: LinkableWorkout): string {
  const parts = [
    workout.target_distance_m === null ? null : formatKm(workout.target_distance_m),
    workout.pace_zone === null ? null : zoneLabel(workout.pace_zone),
    statusWord(workout.status),
    workout.run_count === 0
      ? null
      : workout.run_count === 1
        ? "1 run logged"
        : `${workout.run_count} runs logged`,
  ];
  return parts.filter((part) => part !== null).join(" · ");
}

export function WorkoutPicker({
  workouts,
  value,
  onChange,
  farNotice,
}: WorkoutPickerProps) {
  const name = useId();

  return (
    <fieldset>
      <legend className="font-strong text-body">Which session was this?</legend>

      {workouts.length === 0 ? (
        <p className="mt-stack-sm text-small text-secondary">
          No planned sessions within three days of that date.
        </p>
      ) : null}

      <div className="mt-stack-sm flex flex-col gap-(--choice-gap)">
        {workouts.map((workout) => (
          <label key={workout.id} className={option}>
            <input
              type="radio"
              name={name}
              value={workout.id}
              checked={value === workout.id}
              onChange={() => onChange(workout.id)}
              className="sr-only"
            />
            <span className="font-strong text-body">
              {formatDayLabel(workout.planned_date)} · {workout.title}
            </span>
            <span className="text-small">{describe(workout)}</span>
          </label>
        ))}

        <label className={joinClasses(option, "min-h-touch")}>
          <input
            type="radio"
            name={name}
            value=""
            checked={value === null}
            onChange={() => onChange(null)}
            className="sr-only"
          />
          <span className="font-strong text-body">No session</span>
          <span className="text-small">A run that was not on the plan.</span>
        </label>
      </div>

      {/*
        The link is kept, not dropped: the athlete chose it, and a run a few
        days either side of a session is still plausibly that session. Saying
        so beats silently throwing the choice away.
      */}
      {farNotice ? (
        <p role="status" className="mt-stack-sm text-small text-secondary">
          {farNotice}
        </p>
      ) : null}

      {/* What the form actually submits, so the value is one field either way. */}
      <input type="hidden" name="plannedWorkoutId" value={value ?? ""} />
    </fieldset>
  );
}
