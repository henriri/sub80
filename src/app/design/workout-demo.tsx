"use client";

import { useState } from "react";
import type { ChangeResult } from "@/app/workouts/actions";
import {
  WorkoutActions,
  type WorkoutActionsProps,
} from "@/components/workout/WorkoutActions";
import { WorkoutFacts } from "@/components/workout/WorkoutFacts";
import { planEventMessage, undoneChangeMessage } from "@/lib/calendar";
import type { WorkoutDetail } from "@/lib/plan";

type WorkoutDemoProps = {
  /** Specimens of the read-only half, one per state worth seeing. */
  facts: readonly { label: string; workout: WorkoutDetail }[];
  vdot: number;
  /** Specimens of the writing half, one per shape the actions take. */
  actions: readonly { label: string; props: WorkoutActionsProps }[];
};

const card = [
  "flex flex-col gap-stack-md rounded-surface bg-surface p-inset-md",
  "border-(length:--border-width-default) border-default",
].join(" ");

let nextEvent = 1;

/**
 * A "server" that answers the way the real one does, so every specimen can be
 * pressed: the sentences come from the same wording table the Server Actions
 * use, and each answer carries a fresh token, which is what the toast keys on.
 *
 * `/design` has no session, so the real actions would redirect to the login
 * page. These are the same shape and nothing more.
 */
function answer(kind: string, before: object, after: object): ChangeResult {
  return {
    status: "ok",
    eventId: `00000000-0000-4000-8000-${String(nextEvent++).padStart(12, "0")}`,
    workoutId: "00000000-0000-4000-8000-000000000001",
    message: planEventMessage({
      kind,
      status: "accepted",
      move: null,
      before,
      after,
    }),
    undoneMessage: undoneChangeMessage(kind, before),
    token: crypto.randomUUID(),
  };
}

const demoHandlers: NonNullable<WorkoutActionsProps["handlers"]> = {
  setStatus: async (_previous, formData) =>
    answer(
      "set_status",
      { status: "planned" },
      { status: formData.get("action") === "planned" ? "planned" : "skipped" },
    ),
  lightenWorkout: async (_previous, formData) =>
    answer(
      "lighten_workout",
      { target_distance_m: 14_000 },
      { target_distance_m: formData.get("by") === "0.4" ? 8_500 : 11_000 },
    ),
  restoreDistance: async () =>
    answer(
      "restore_distance",
      { target_distance_m: 8_500 },
      { target_distance_m: 14_000, original_distance_m: null },
    ),
  undoChange: async () => ({ status: "ok", eventId: "undone" }),
};

/** A refusal, so the error state is on screen and not only imagined. */
const refusingHandlers: NonNullable<WorkoutActionsProps["handlers"]> = {
  ...demoHandlers,
  setStatus: async () => ({
    status: "error",
    message: "This session is already marked done.",
    token: crypto.randomUUID(),
  }),
};

/**
 * The detail view, both halves.
 *
 * The writing half is interactive because what there is to look at is the
 * toast, the countdown and a disabled button -- none of which exist in a
 * static render. One specimen refuses, so the error state is visible too.
 */
export function WorkoutDemo({ facts, vdot, actions }: WorkoutDemoProps) {
  const [refusing, setRefusing] = useState(false);

  return (
    <>
      {facts.map(({ label, workout }) => (
        <div key={label} className={card}>
          <h3 className="text-heading-sm">Workout detail · {label}</h3>
          <h4 className="text-heading-sm">{workout.title}</h4>
          <WorkoutFacts workout={workout} vdot={vdot} />
        </div>
      ))}

      {actions.map(({ label, props }) => (
        <div key={label} className={card}>
          <h3 className="text-heading-sm">Workout actions · {label}</h3>
          <p className="text-small text-secondary">
            Every form answers the way the real one does. The toast counts down
            and pauses on hover and on focus. It is the only route to an undo, so
            a change not reversed before it expires stands.
          </p>
          <WorkoutActions
            {...props}
            handlers={refusing ? refusingHandlers : demoHandlers}
          />
        </div>
      ))}

      <div className={card}>
        <h3 className="text-heading-sm">Workout actions · a refused change</h3>
        <p className="text-small text-secondary">
          With this on, the status buttons refuse. A refusal takes the Undo
          button away even while its countdown is still running: the event it
          pointed at is still undoable, but offering it next to an error about
          something else reads as &ldquo;undo this error&rdquo;.
        </p>
        <label className="flex min-h-touch items-center gap-inline-sm text-body">
          <input
            type="checkbox"
            checked={refusing}
            onChange={(event) => setRefusing(event.target.checked)}
          />
          Refuse every status change
        </label>
      </div>
    </>
  );
}
