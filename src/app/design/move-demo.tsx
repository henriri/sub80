"use client";

import { useState } from "react";
import { Calendar } from "@/components/calendar/Calendar";
import { DropHint } from "@/components/calendar/DropHint";
import { MoveDialog } from "@/components/calendar/MoveDialog";
import { MovePicker } from "@/components/calendar/MovePicker";
import { RecentChanges } from "@/components/calendar/RecentChanges";
import { UndoToast } from "@/components/calendar/UndoToast";
import type { MoveAction, UndoAction } from "@/components/calendar/CalendarBoard";
import {
  applyMove,
  movedMessage,
  planEventMessage,
  rejectMessage,
  undoableIndex,
  undoneChangeMessage,
  undoneMessage,
  type CalendarViewModel,
  type PlanEventSummary,
} from "@/lib/calendar";
import { validateMove, type MoveCheck, type MoveWarning, type Ymd } from "@/lib/plan";
import {
  changeFeedback,
  idle,
  type ChangeFeedback,
  type ChangeFeedbackEvent,
} from "@/lib/ui/change-feedback";

type MoveDemoProps = {
  week: CalendarViewModel;
  month: CalendarViewModel;
  today: Ymd;
  /** The session the picker and the dialog specimens talk about. */
  sample: { id: string; title: string; date: Ymd };
};

const card = [
  "flex flex-col gap-stack-md rounded-surface bg-surface p-inset-md",
  "border-(length:--border-width-default) border-default",
].join(" ");

const button = [
  "inline-flex min-h-touch items-center justify-center",
  "rounded-control border-(length:--border-width-default) border-default",
  "px-inline-md text-small hover:bg-raised",
  "focus-visible:outline-(length:--border-width-focus)",
  "focus-visible:outline-offset-(--space-focus-offset) focus-visible:outline-focus",
].join(" ");

const doubleDay = {
  code: "double_day",
  date: "2027-03-19",
  other: { id: "other", title: "30′ time trial", isKey: true },
  bothKey: true,
} satisfies Extract<MoveWarning, { code: "double_day" }>;

const consecutiveKey = {
  code: "consecutive_key",
  date: "2027-03-19",
  neighbourDate: "2027-03-18",
  neighbour: { id: "neighbour", title: "Threshold 3 × 12′", isKey: true },
  side: "before",
} satisfies Extract<MoveWarning, { code: "consecutive_key" }>;

/** One check per drop state, so each tint and each word has a specimen. */
const checks: { label: string; check: MoveCheck }[] = [
  { label: "valid", check: { ok: true, warnings: [] } },
  { label: "warning", check: { ok: true, warnings: [doubleDay] } },
  {
    label: "invalid · full",
    check: { ok: false, reason: { code: "day_full", date: "2027-03-19", max: 2 } },
  },
  {
    label: "invalid · over the ceiling",
    check: {
      ok: false,
      reason: {
        code: "week_cap_exceeded",
        weekIndex: 22,
        metres: 62_000,
        capKm: 60,
      },
    },
  },
];

/**
 * What each toast specimen should show, as an event rather than as a state.
 *
 * A `changed` state contains a running countdown, and a countdown needs a clock.
 * Reading one at module scope would read it during the prerender, so the state
 * is built from these on mount instead.
 */
const seeds: { label: string; seed: ChangeFeedbackEvent }[] = [
  {
    label: "moved · counting down",
    seed: {
      type: "changed",
      eventId: "event-1",
      workoutId: "workout-1",
      message: movedMessage("Easy run + 6 strides", "2027-03-20"),
      undoneMessage: undoneMessage("Easy run + 6 strides", "2027-03-18"),
      now: 0,
    },
  },
  {
    label: "notes saved · counting down",
    seed: {
      type: "changed",
      eventId: "event-2",
      workoutId: "workout-1",
      // The same machine, the same toast, a different kind of change: the
      // sentences come from the caller and nothing here is about moving.
      message: planEventMessage({
        kind: "edit_notes",
        status: "accepted",
        move: null,
        before: { notes: null },
        after: { notes: "Calves tight on the second rep." },
      }),
      undoneMessage: undoneChangeMessage("edit_notes", { notes: null }),
      now: 0,
    },
  },
  {
    label: "undone",
    seed: {
      type: "undone",
      message: undoneMessage("Easy run + 6 strides", "2027-03-18"),
    },
  },
  {
    label: "refused",
    seed: {
      type: "error",
      message: rejectMessage({
        code: "week_cap_exceeded",
        weekIndex: 22,
        metres: 62_000,
        capKm: 60,
      }),
    },
  },
];

/**
 * A history that has just had an undo in it, with a change of every kind: the
 * undo is newest, the change it reversed is marked undone, and the one below
 * that is the only row the database would now accept. `undoableIndex` decides which, exactly as the
 * page does, so this specimen cannot drift from the rule it illustrates.
 */
const history: (PlanEventSummary & { id: string })[] = [
  {
    id: "00000000-0000-4000-8000-00000000e005",
    kind: "undo_change",
    status: "accepted",
    move: null,
    before: { notes: "Calves tight on the second rep." },
    after: { notes: null },
    undoneKind: "edit_notes",
  },
  {
    id: "00000000-0000-4000-8000-00000000e004",
    kind: "edit_notes",
    status: "undone",
    move: null,
    before: { notes: null },
    after: { notes: "Calves tight on the second rep." },
  },
  {
    id: "00000000-0000-4000-8000-00000000e003",
    kind: "lighten_workout",
    status: "accepted",
    move: null,
    before: { target_distance_m: 14_000, original_distance_m: null },
    after: { target_distance_m: 11_000, original_distance_m: 14_000 },
  },
  {
    id: "00000000-0000-4000-8000-00000000e002",
    kind: "set_status",
    status: "accepted",
    move: null,
    before: { status: "planned" },
    after: { status: "skipped" },
  },
  {
    id: "00000000-0000-4000-8000-00000000e001",
    kind: "move_workout",
    status: "accepted",
    move: { from: "2027-03-18", to: "2027-03-20" },
    before: { planned_date: "2027-03-18" },
    after: { planned_date: "2027-03-20" },
  },
];

const undoableRow = undoableIndex(history);
const changes = history.map((event, index) => ({
  ...event,
  undoable: index === undoableRow,
}));

/**
 * A live calendar whose "server" is this component.
 *
 * /design has no session, so the real action would send the page to the login
 * form the moment a card landed, and a drag that cannot finish is not a
 * specimen of a drag. This stands in for the round trip and for the
 * revalidation that follows it, so the drop, the dialog, the toast and the
 * countdown can all be tried in every mode.
 */
function LiveCalendar({
  initial,
  today,
}: {
  initial: CalendarViewModel;
  today: Ymd;
}) {
  const [model, setModel] = useState(initial);
  const [events, setEvents] = useState(0);

  const onMove: MoveAction = async ({ workoutId, toDate }) => {
    const day = daysOf(model).find((candidate) =>
      candidate.items.some((item) => item.id === workoutId),
    );
    const title =
      day?.items.find((item) => item.id === workoutId)?.title ?? "This session";

    // Stands in for the revalidation that follows the real action, so the
    // card stays where it was dropped instead of snapping back.
    setModel((current) => applyMove(current, { workoutId, toDate }));
    setEvents((count) => count + 1);

    return {
      status: "ok",
      eventId: `demo-event-${events + 1}`,
      workoutId,
      title,
      from: day?.date ?? toDate,
      to: toDate,
    };
  };

  const onUndo: UndoAction = async (eventId) => ({ status: "ok", eventId });

  return (
    <Calendar
      model={model}
      today={today}
      titleLevel={4}
      interactive
      onMove={onMove}
      onUndo={onUndo}
    />
  );
}

/** Every piece of the move interaction, as specimens. */
export function MoveDemo({ week, month, today, sample }: MoveDemoProps) {
  const [dialog, setDialog] = useState<readonly MoveWarning[] | null>(null);
  const [picker, setPicker] = useState(false);

  return (
    <>
      <div className={card}>
        <h3 className="text-heading-sm">Calendar · week, movable</h3>
        <p className="text-small text-secondary">
          Drag a session, or use its handle with the keyboard: space, the arrow
          keys, space again. Every day says whether it would take it.
        </p>
        <LiveCalendar initial={week} today={today} />
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">Calendar · month, movable</h3>
        <p className="text-small text-secondary">
          A marker is draggable but cannot be a 44px target in seven columns,
          which is why the cell links through to the day view, where a card has
          a Move to button.
        </p>
        <LiveCalendar initial={month} today={today} />
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">DropHint</h3>
        <p className="text-small text-secondary">
          A glyph and a word in every state, so the answer never depends on the
          tint. The short form is all a month square has room for.
        </p>
        <ul className="flex flex-col gap-stack-sm">
          {checks.map(({ label, check }) => (
            <li key={label} className="flex items-center gap-inline-md text-small">
              <DropHint check={check} />
              <DropHint check={check} size="cell" />
              <span className="text-secondary">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">UndoToast</h3>
        <p className="text-small text-secondary">
          The countdown pauses on hover and on keyboard focus. Only the
          shortcut expires; the change itself stays in Recent changes.
        </p>
        {seeds.map(({ label, seed }) => (
          <div key={label} className="flex flex-col gap-stack-sm">
            <p className="text-small text-secondary">{label}</p>
            <ToastSpecimen seed={seed} />
          </div>
        ))}
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">RecentChanges</h3>
        <p className="text-small text-secondary">
          Undo is a stack, so the button sits on the newest move that has not
          been undone, which here is not the newest row.
        </p>
        <RecentChanges
          changes={changes}
          onUndo={async (eventId) => ({ status: "ok", eventId })}
        />
      </div>

      <div className={card}>
        <h3 className="text-heading-sm">MoveDialog and MovePicker</h3>
        <p className="text-small text-secondary">
          The dialog lists every warning that applies, not a summary of them.
          The picker refuses a day in place, with the reason as its name.
        </p>
        <div className="flex flex-wrap gap-inline-sm">
          <button
            type="button"
            onClick={() => setDialog([doubleDay])}
            className={button}
          >
            One warning
          </button>
          <button
            type="button"
            onClick={() => setDialog([doubleDay, consecutiveKey])}
            className={button}
          >
            Two at once
          </button>
          <button type="button" onClick={() => setPicker(true)} className={button}>
            Move to…
          </button>
        </div>
      </div>

      {dialog === null ? null : (
        <MoveDialog
          warnings={dialog}
          onCancel={() => setDialog(null)}
          onConfirm={() => setDialog(null)}
        />
      )}

      {picker ? (
        <MovePicker
          title={sample.title}
          fromDate={sample.date}
          check={(toDate) =>
            validateMove({
              workout: {
                id: sample.id,
                planned_date: sample.date,
                target_distance_m: 8000,
                is_key: false,
                status: "planned",
                day_slot: 0,
                title: sample.title,
              },
              toDate,
              weekWorkouts: [],
              today,
            })
          }
          onCancel={() => setPicker(false)}
          onPick={() => setPicker(false)}
        />
      ) : null}
    </>
  );
}

/** Every day in a model, whichever view it is. */
function daysOf(model: CalendarViewModel) {
  switch (model.view) {
    case "week":
      return model.days;
    case "month":
      return model.weeks.flat();
    case "day":
      return [model.day];
  }
}

/**
 * A toast with state of its own, so hovering it really does pause it.
 *
 * A toast with a countdown waits to be asked for. Its state needs a clock, and
 * the only places a clock may honestly be read are an event handler and an
 * interval -- never a render, which a prerender also runs. The button is no
 * loss: a toast appearing is part of what there is to look at, and the live
 * calendars above show the same thing after a real drop. The other two states
 * have no clock, so they are simply there.
 */
function ToastSpecimen({ seed }: { seed: ChangeFeedbackEvent }) {
  const [current, setCurrent] = useState<ChangeFeedback>(() =>
    seed.type === "changed" ? idle : changeFeedback(idle, seed),
  );
  const apply = (event: ChangeFeedbackEvent) =>
    setCurrent((previous: ChangeFeedback) => changeFeedback(previous, event));

  if (current.kind === "idle") {
    return (
      <button
        type="button"
        onClick={() =>
          apply(seed.type === "changed" ? { ...seed, now: Date.now() } : seed)
        }
        className={button}
      >
        Show the toast
      </button>
    );
  }

  return (
    <UndoToast
      state={current}
      onUndo={() => apply({ type: "undone", message: "Put back." })}
      onHold={(held) => apply({ type: "hold", hold: held, now: Date.now() })}
      onRelease={(held) => apply({ type: "release", hold: held, now: Date.now() })}
      onDismiss={() => setCurrent(idle)}
    />
  );
}
