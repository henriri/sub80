"use client";

import { useState } from "react";
import type { RunResult } from "@/app/runs/actions";
import { DeleteRunButton } from "@/components/runs/DeleteRunButton";
import { RunForm } from "@/components/runs/RunForm";
import { WorkoutPicker } from "@/components/runs/WorkoutPicker";
import type { Ymd } from "@/lib/plan";
import {
  resetOffer,
  runLoggedMessage,
  type LinkableWorkout,
  type RawRun,
} from "@/lib/runs";

type RunDemoProps = {
  initial: RawRun;
  workouts: readonly LinkableWorkout[];
  today: Ymd;
  vdot: number;
};

const card = [
  "flex flex-col gap-stack-md rounded-surface bg-surface p-inset-md",
  "border-(length:--border-width-default) border-default",
].join(" ");

/**
 * A "server" that answers the way the real one does.
 *
 * `/design` has no session, so the real actions would redirect to the login
 * page. These are the same shape and nothing more, and each answer carries a
 * fresh token, which is what the form keys "this answer" on.
 */
async function accepts(_previous: RunResult | null, formData: FormData): Promise<RunResult> {
  const km = Number(String(formData.get("distanceKm") ?? "0").replace(",", ".")) || 0;

  return {
    status: "ok",
    runId: "00000000-0000-4000-8000-000000000001",
    message: runLoggedMessage(
      String(formData.get("date") ?? "2027-03-18"),
      Math.round(km * 1000),
    ),
    token: crypto.randomUUID(),
  };
}

/** A refusal, so the error state is on screen and not only imagined. */
async function refuses(): Promise<RunResult> {
  return {
    status: "error",
    message: "Could not log the run. Try again.",
    token: crypto.randomUUID(),
  };
}

/**
 * The server raising a warning the form did not, which is also where a submit
 * with no JavaScript lands. The form opens the same dialog for it.
 */
async function asks(): Promise<RunResult> {
  return {
    status: "needs_confirmation",
    warnings: [{ code: "workout_has_run", runs: 1 }],
    token: crypto.randomUUID(),
  };
}

async function deletes(): Promise<RunResult> {
  return {
    status: "error",
    message: "Another run is still linked to that session.",
    token: crypto.randomUUID(),
  };
}

/**
 * The run screens' interactive parts.
 *
 * Interactive because what there is to look at does not exist in a static
 * render: the live pace, the zone line that follows the chosen session, the
 * heart-rate source appearing once a reading is typed, the character count,
 * and the confirmation dialog.
 */
export function RunDemo({ initial, workouts, today, vdot }: RunDemoProps) {
  const [answer, setAnswer] = useState<"accepts" | "refuses" | "asks">("accepts");
  const [picked, setPicked] = useState<string | null>(workouts[0]?.id ?? null);

  const action = answer === "accepts" ? accepts : answer === "refuses" ? refuses : asks;

  return (
    <>
      <div className={card}>
        <h3 className="text-heading-sm">WorkoutPicker</h3>
        <p className="text-small text-secondary">
          Every option says its status, and how many runs it already has. “No
          session” is a real option rather than the absence of one, so clearing
          a link is a single tap.
        </p>
        <WorkoutPicker
          workouts={workouts}
          value={picked}
          onChange={setPicked}
          farNotice={null}
        />
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">WorkoutPicker · the date moved away</h3>
        <WorkoutPicker
          workouts={workouts}
          value={workouts[0]?.id ?? null}
          onChange={() => undefined}
          farNotice="That session is more than 3 days from this date. The link is kept; change it below if it is wrong."
        />
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">WorkoutPicker · nothing near that day</h3>
        <WorkoutPicker
          workouts={[]}
          value={null}
          onChange={() => undefined}
          farNotice={null}
        />
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">DeleteRunButton</h3>
        <p className="text-small text-secondary">
          The checkbox is offered only when ticking it would do something, and
          is ticked by default: deleting a run almost always means the session
          did not happen after all.
        </p>
        <DeleteRunButton
          runId="00000000-0000-4000-8000-000000000001"
          offer={resetOffer({
            workoutTitle: "Threshold 3 × 12′ (2′ jog)",
            workoutStatus: "completed",
            otherRuns: 0,
          })}
          action={deletes}
        />
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">
          DeleteRunButton · another run is still linked
        </h3>
        <p className="text-small text-secondary">
          No checkbox, and a sentence saying why: this is the one case the
          athlete might have expected it.
        </p>
        <DeleteRunButton
          runId="00000000-0000-4000-8000-000000000002"
          offer={resetOffer({
            workoutTitle: "Threshold 3 × 12′ (2′ jog)",
            workoutStatus: "completed",
            otherRuns: 1,
          })}
          action={deletes}
        />
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">RunForm · what the server answers</h3>
        <p className="text-small text-secondary">
          Try 10 km in 20:00 for the pace refusal, 10 km in 1:40:00 for the
          warning dialog, and a heart rate with no source.
        </p>
        <fieldset className="flex flex-wrap gap-inline-sm">
          <legend className="sr-only">The answer the demo server gives</legend>
          {(["accepts", "refuses", "asks"] as const).map((option) => (
            <label
              key={option}
              className="inline-flex min-h-touch cursor-pointer items-center rounded-control border-(length:--border-width-default) border-default px-inset-md text-small has-checked:bg-accent has-checked:text-on-accent has-focus-visible:outline-(length:--border-width-focus) has-focus-visible:outline-offset-(--space-focus-offset) has-focus-visible:outline-focus"
            >
              <input
                type="radio"
                name="run-demo-answer"
                value={option}
                checked={answer === option}
                onChange={() => setAnswer(option)}
                className="sr-only"
              />
              {option}
            </label>
          ))}
        </fieldset>
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">RunForm</h3>
        <RunForm
          runId={null}
          initial={initial}
          workouts={workouts}
          today={today}
          vdot={vdot}
          action={action}
          submitLabel="Log this run"
        />
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">RunForm · logging for a chosen session</h3>
        <p className="text-small text-secondary">
          Reached with Log run on a session&rsquo;s own page. The session is
          already chosen, so the picker gives way to a line saying which one the
          form heard; the day and the planned distance arrive prefilled, as a
          starting point to correct. Unlinking lives on the run&rsquo;s own page.
        </p>
        <RunForm
          runId={null}
          initial={initial}
          workouts={[]}
          lockedSession={workouts[0] ?? null}
          today={today}
          vdot={vdot}
          action={action}
          submitLabel="Log this run"
        />
      </div>
    </>
  );
}
