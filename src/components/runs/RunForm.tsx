"use client";

import Link from "next/link";
import { useActionState, useId, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { ChoiceGroup } from "@/components/ChoiceGroup";
import { TextArea } from "@/components/TextArea";
import { TextField } from "@/components/TextField";
import { navLink } from "@/components/calendar/styles";
import {
  MAX_NOTES_LENGTH,
  notesRemaining,
  notesTooLong,
  type Ymd,
} from "@/lib/plan";
import {
  LINK_WINDOW_DAYS,
  formatPacePerKm,
  hrSourceChoices,
  isBlank,
  isLinkFar,
  isStatsLocked,
  linkableOn,
  loggingForLine,
  paceVsZone,
  paceVsZoneLine,
  reasonField,
  rpeBandsHint,
  rpeChoices,
  runRejectMessage,
  statsLockedMessage,
  validateRun,
  type LinkableWorkout,
  type RawRun,
  type RunField,
  type RunSource,
  type RunWarning,
} from "@/lib/runs";
import type { RunResult } from "@/app/runs/actions";
import { RunWarningDialog } from "./RunWarningDialog";
import { WorkoutPicker } from "./WorkoutPicker";
import { runPanel } from "./styles";

export type RunAction = (
  previous: RunResult | null,
  formData: FormData,
) => Promise<RunResult>;

export type RunFormProps = {
  /** The run being edited, or null when one is being logged for the first time. */
  runId: string | null;
  /** The fields as they start, already strings. */
  initial: RawRun;
  /** The wide window of sessions; narrowed here to whatever date is chosen. */
  workouts: readonly LinkableWorkout[];
  /**
   * The session this run is being logged against, when it was chosen before the
   * form opened -- Log run on a session's own page.
   *
   * Set, there is no picker: the choice has been made, the form states it, and
   * the link cannot be changed from here. Unlinking and re-linking live on the
   * run's own page, which is where a run that was filed against the wrong
   * session is corrected.
   */
  lockedSession?: LinkableWorkout | null;
  /**
   * Where the run came from, when one is being edited.
   *
   * Anything but `manual` and its measurements are the device's record: the
   * date, time, distance, duration and heart rate render read-only with one
   * line saying why, while the effort, the notes and the session stay the
   * athlete's to change. `update_run` refuses the same edit in SQL, so this is
   * the courtesy rather than the guarantee.
   */
  source?: RunSource;
  /** Today in Europe/Paris, so the rules never read a clock in the browser. */
  today: Ymd;
  /**
   * The athlete's VDOT now. Used only for the live line while typing: what
   * gets STORED is snapshotted by SQL, and for an existing run the line on its
   * own page comes from the snapshot instead.
   */
  vdot: number;
  action: RunAction;
  submitLabel: string;
};

/**
 * The one form for logging and for editing a run.
 *
 * The same `validateRun` the Server Action re-runs decides what is shown here,
 * so the form and the server cannot disagree about why a run is refused. One
 * reason at a time, routed by `reasonField` to the control it is about.
 *
 * Warnings are different from refusals: an unusually slow pace, or a second
 * run on one session, is something the athlete confirms. The dialog asks, and
 * confirming sends each warning's code back with the form. The server re-runs
 * the rules and refuses any warning it was not given a code for, so the dialog
 * is a courtesy rather than the thing being trusted.
 */
export function RunForm({
  runId,
  initial,
  workouts,
  lockedSession = null,
  source = "manual",
  today,
  vdot,
  action,
  submitLabel,
}: RunFormProps) {
  /*
   * An imported run's measurements are read-only. The same predicate the Server
   * Action refuses with, so a field is never editable here and refused there.
   */
  const locked = isStatsLocked(source);
  const [result, dispatch, pending] = useActionState(action, null);
  const [draft, setDraft] = useState<RawRun>(initial);
  const [confirmed, setConfirmed] = useState<readonly RunWarning["code"][]>([]);
  /** True once a submit has been attempted, so nothing is red before then. */
  const [tried, setTried] = useState(false);

  /*
   * Three pieces of state about one answer, all of them derived from it rather
   * than copied out of it in an effect: which warnings the form itself raised,
   * which server answer has been dismissed, and which has been edited past.
   * Every result carries a fresh token, so "this one" is always identifiable
   * and a later identical answer is never mistaken for the dismissed one.
   */
  const [raised, setRaised] = useState<readonly RunWarning[] | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [editedPast, setEditedPast] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const field = (name: string) => `${id}-${name}`;

  const chosen =
    lockedSession ?? workouts.find((w) => w.id === draft.plannedWorkoutId) ?? null;
  const offered = linkableOn(workouts, draft.date);
  const check = validateRun({
    raw: draft,
    today,
    linkedRuns: chosen?.run_count ?? 0,
  });

  function update(changes: Partial<RawRun>) {
    setDraft((previous) => ({ ...previous, ...changes }));
    // Any edit makes the answer on screen stale, whatever it said.
    if (result !== null) setEditedPast(result.token);
    setRaised(null);
  }

  /*
   * The server found a warning the form did not, which is also where a submit
   * with no JavaScript lands. Treated exactly like one the form raised.
   */
  const fromServer =
    result?.status === "needs_confirmation" && dismissed !== result.token
      ? result.warnings
      : null;
  const asking = raised ?? fromServer;

  /** The sentence for a field, or null when that field is not the problem. */
  function errorFor(name: RunField): string | undefined {
    if (!tried || check.ok) return undefined;
    return reasonField(check.reason) === name
      ? runRejectMessage(check.reason)
      : undefined;
  }

  const hrGiven = !isBlank(draft.avgHr);
  const tooLong = notesTooLong(draft.notes);
  const remaining = notesRemaining(draft.notes);
  const saved = result?.status === "ok" && editedPast !== result.token;

  /**
   * The live pace line, and the one factual sentence about the zone when a
   * session is linked. Both are statements, never a judgement.
   */
  const paceLine = check.ok ? formatPacePerKm(check.run.paceSecPerKm) : null;
  const zoneLine =
    check.ok && chosen?.pace_zone != null
      ? paceVsZoneLine(
          paceVsZone(check.run.paceSecPerKm, chosen.pace_zone, vdot),
          chosen.pace_zone,
        )
      : null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    setTried(true);

    if (!check.ok) {
      event.preventDefault();
      return;
    }

    const unconfirmed = check.warnings.filter(
      (warning) => !confirmed.includes(warning.code),
    );
    if (unconfirmed.length > 0) {
      event.preventDefault();
      setRaised(unconfirmed);
    }
  }

  /** Stops the dialog coming straight back for the answer just dealt with. */
  function closeAsking() {
    setRaised(null);
    if (result?.status === "needs_confirmation") setDismissed(result.token);
  }

  /**
   * Submits with the warnings answered.
   *
   * The form is dispatched directly rather than re-submitted, so the codes go
   * with THIS submit instead of needing a render first for hidden inputs to
   * appear. The inputs are still there, so a later plain submit keeps the
   * answers; this just does not depend on them having rendered yet.
   */
  function onConfirm() {
    const codes = [
      ...new Set([...confirmed, ...(asking ?? []).map((warning) => warning.code)]),
    ];
    setConfirmed(codes);
    closeAsking();

    const form = formRef.current;
    if (form === null) return;

    const data = new FormData(form);
    data.delete("confirmed");
    for (const code of codes) data.append("confirmed", code);
    dispatch(data);
  }

  return (
    <>
      <form
        ref={formRef}
        action={dispatch}
        onSubmit={onSubmit}
        className="flex flex-col gap-stack-lg"
        noValidate
      >
        {runId === null ? null : <input type="hidden" name="runId" value={runId} />}

        {/*
          Each confirmed warning travels as its own value, which is what the
          action reads with getAll. A code the rules do not know is rejected by
          the schema, so this cannot be used to silence a rule.
        */}
        {confirmed.map((code) => (
          <input key={code} type="hidden" name="confirmed" value={code} />
        ))}

        {/*
          One line, once: the measurements below are the device's record. Said
          at the top rather than beside each field, which would be five copies
          of the same sentence.
        */}
        {locked ? (
          <p className="text-small text-secondary">{statsLockedMessage(source)}</p>
        ) : null}

        <section className={runPanel}>
          <TextField
            id={field("date")}
            name="date"
            type="date"
            label="Day"
            max={today}
            value={draft.date}
            onChange={(event) => update({ date: event.target.value })}
            error={errorFor("date")}
            readOnly={locked}
            required
          />

          <TextField
            id={field("time")}
            name="time"
            type="time"
            label="Start time"
            hint={
              locked
                ? undefined
                : "Optional. Left empty, the run is filed without a time."
            }
            value={draft.time}
            onChange={(event) => update({ time: event.target.value })}
            error={errorFor("time")}
            readOnly={locked}
          />
        </section>

        <section className={runPanel}>
          <TextField
            id={field("distanceKm")}
            name="distanceKm"
            label="Distance in kilometres"
            hint={
              locked ? undefined : "A comma or a dot, whichever your keyboard gives you."
            }
            inputMode="decimal"
            autoComplete="off"
            value={draft.distanceKm}
            onChange={(event) => update({ distanceKm: event.target.value })}
            error={errorFor("distanceKm")}
            readOnly={locked}
            required
          />

          <TextField
            id={field("duration")}
            name="duration"
            label="Time"
            hint={locked ? undefined : "42:30, 1:23:45, or a number of minutes."}
            inputMode="text"
            autoComplete="off"
            value={draft.duration}
            onChange={(event) => update({ duration: event.target.value })}
            error={errorFor("duration")}
            readOnly={locked}
            required
          />

          {/*
            Polite, not assertive: this changes on every keystroke, and a live
            region that interrupts on each one would be unusable.
          */}
          <div role="status" className="flex flex-col gap-stack-sm">
            {paceLine ? <p className="font-strong text-body">{paceLine}</p> : null}
            {zoneLine ? <p className="text-small text-secondary">{zoneLine}</p> : null}
            {errorFor("pace") ? (
              <p className="text-small text-danger">{errorFor("pace")}</p>
            ) : null}
          </div>
        </section>

        <section className={runPanel}>
          <ChoiceGroup
            name="rpe"
            legend="How hard was it?"
            hint={rpeBandsHint()}
            options={rpeChoices()}
            value={draft.rpe === "" ? null : draft.rpe}
            onChange={(value) => update({ rpe: value })}
            error={errorFor("rpe")}
          />
        </section>

        <section className={runPanel}>
          <TextField
            id={field("avgHr")}
            name="avgHr"
            label="Average heart rate"
            hint={locked ? undefined : "Optional."}
            inputMode="numeric"
            autoComplete="off"
            value={draft.avgHr}
            onChange={(event) =>
              // Clearing the reading clears the source with it: a source on its
              // own is refused, and leaving it behind would refuse a form the
              // athlete thinks they have emptied.
              update({
                avgHr: event.target.value,
                ...(isBlank(event.target.value) ? { hrSource: "" } : {}),
              })
            }
            error={errorFor("avgHr")}
            readOnly={locked}
          />

          {/*
            Only once there is a reading, and required from then on: the two
            sources are never mixed or averaged, so a reading whose source
            nobody recorded is worse than no reading at all.

            An imported reading states its source rather than offering the
            choice. A hidden field, not a disabled radio group: a disabled
            control submits nothing at all, and the server compares what it is
            sent against what is stored, so an absent source would read as an
            edit and be refused.
          */}
          {hrGiven ? (
            locked ? (
              <>
                <p className="text-small text-secondary">
                  Measured with{" "}
                  {hrSourceChoices()
                    .find((choice) => choice.value === draft.hrSource)
                    ?.label.toLowerCase() ?? draft.hrSource}
                  .
                </p>
                <input type="hidden" name="hrSource" value={draft.hrSource} />
              </>
            ) : (
              <ChoiceGroup
                name="hrSource"
                legend="Where did it come from?"
                options={hrSourceChoices()}
                value={draft.hrSource === "" ? null : draft.hrSource}
                onChange={(value) => update({ hrSource: value })}
                error={errorFor("hrSource")}
                required
              />
            )
          ) : null}
        </section>

        <section className={runPanel}>
          <TextArea
            id={field("notes")}
            name="notes"
            label="How did it feel"
            rows={4}
            value={draft.notes}
            onChange={(event) => update({ notes: event.target.value })}
            describedBy={field("notes-count")}
            error={errorFor("notes")}
          />
          <p
            id={field("notes-count")}
            role="status"
            className={tooLong ? "text-small text-danger" : "text-small text-secondary"}
          >
            {tooLong
              ? `${-remaining} characters over the ${MAX_NOTES_LENGTH} allowed.`
              : `${remaining} characters left.`}
          </p>
        </section>

        <section className={runPanel}>
          {lockedSession === null ? (
            <WorkoutPicker
              workouts={offered}
              value={draft.plannedWorkoutId}
              onChange={(workoutId) => update({ plannedWorkoutId: workoutId })}
              farNotice={
                isLinkFar(workouts, draft.date, draft.plannedWorkoutId)
                  ? `That session is more than ${LINK_WINDOW_DAYS} days from this date. The link is kept; change it below if it is wrong.`
                  : null
              }
            />
          ) : (
            <>
              {/*
                A statement rather than a control. The link still travels as the
                same hidden field the picker writes, so the server reads one
                shape whichever way the form was reached.
              */}
              <p className="text-small text-secondary">Logging for</p>
              <p className="font-strong text-body">{loggingForLine(lockedSession)}</p>
              <input
                type="hidden"
                name="plannedWorkoutId"
                value={lockedSession.id}
              />
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-inline-md">
          <Button type="submit" disabled={pending || saved}>
            {pending ? "Saving…" : submitLabel}
          </Button>

          {saved && result.status === "ok" ? (
            <Link href={`/runs/${result.runId}`} className={navLink}>
              View the run
            </Link>
          ) : null}
        </div>

        {/*
          Assertive: this is the answer to something the athlete just did, and
          it is the only place a server refusal appears.
        */}
        <p role="alert" aria-live="assertive" className="text-small">
          {result?.status === "error" ? (
            <span className="text-danger">{result.message}</span>
          ) : null}
          {saved && result.status === "ok" ? (
            <span className="text-secondary">{result.message}</span>
          ) : null}
        </p>
      </form>

      {asking ? (
        <RunWarningDialog
          warnings={asking}
          onConfirm={onConfirm}
          onCancel={closeAsking}
        />
      ) : null}
    </>
  );
}
