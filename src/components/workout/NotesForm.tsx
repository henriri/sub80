"use client";

import { useId, useState } from "react";
import { Button } from "@/components/Button";
import { focusRing, joinClasses } from "@/components/calendar/styles";
import { MAX_NOTES_LENGTH, notesRemaining, notesTooLong } from "@/lib/plan";

type NotesFormProps = {
  workoutId: string;
  /** The stored note, which is null rather than empty when there is none. */
  notes: string | null;
  /** The dispatch from the island's own action state. */
  action: (formData: FormData) => void;
  pending: boolean;
};

const field = [
  "w-full min-h-(--field-min-height) px-(--field-padding-x) py-(--field-padding-y)",
  "rounded-(--field-radius) bg-(--field-bg) text-(color:--field-fg)",
  "border-(length:--border-width-default) border-(--field-border)",
  "font-(family-name:--field-font-family) text-body",
  "aria-invalid:border-(--field-border-error)",
  focusRing,
].join(" ");

/**
 * The notes on one session: how it went, how it felt, what to watch.
 *
 * A real `textarea` in a real form, so the keyboard works, the field grows and
 * a long note can be written without the page doing anything clever. The
 * count is live but the rule is not duplicated here: `notesTooLong` and
 * `notesRemaining` are the same functions the Server Action re-runs, and both
 * count after trimming, so trailing whitespace never trips the limit.
 *
 * `maxLength` is deliberately NOT set. A hard stop mid-word with no
 * explanation is worse than a count going negative and the button refusing,
 * and the server is the thing that actually decides either way.
 */
export function NotesForm({ workoutId, notes, action, pending }: NotesFormProps) {
  const [draft, setDraft] = useState(notes ?? "");
  const id = useId();
  const countId = `${id}-count`;

  const tooLong = notesTooLong(draft);
  const remaining = notesRemaining(draft);
  const unchanged = draft.trim() === (notes ?? "");

  return (
    <form action={action} className="flex flex-col gap-stack-sm">
      <label htmlFor={id} className="font-strong text-body">
        Notes
      </label>

      <textarea
        id={id}
        name="notes"
        rows={4}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-invalid={tooLong || undefined}
        aria-describedby={countId}
        className={field}
      />

      <input type="hidden" name="workoutId" value={workoutId} />

      <div className="flex flex-wrap items-center justify-between gap-inline-sm">
        {/*
          Polite, not assertive: the count changes on every keystroke, and a
          live region that interrupts on each one would be unusable.
        */}
        <p
          id={countId}
          role="status"
          className={joinClasses(
            "text-small",
            tooLong ? "text-danger" : "text-secondary",
          )}
        >
          {tooLong
            ? `${-remaining} characters over the ${MAX_NOTES_LENGTH} allowed.`
            : `${remaining} characters left.`}
        </p>

        <Button type="submit" disabled={pending || tooLong || unchanged}>
          {pending ? "Saving…" : "Save notes"}
        </Button>
      </div>
    </form>
  );
}
