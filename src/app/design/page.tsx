import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { ChoiceGroup } from "@/components/ChoiceGroup";
import { TextArea } from "@/components/TextArea";
import { TextField } from "@/components/TextField";
import { WorkoutList } from "@/components/WorkoutList";
import { BigNumber } from "@/components/calendar/BigNumber";
import { Calendar } from "@/components/calendar/Calendar";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { DoneBadge } from "@/components/calendar/DoneBadge";
import { FocusCard } from "@/components/calendar/FocusCard";
import { YearChart } from "@/components/calendar/YearChart";
import { KindBadge } from "@/components/calendar/KindBadge";
import { WorkoutCard } from "@/components/calendar/WorkoutCard";
import type { WorkoutActionsProps } from "@/components/workout/WorkoutActions";
import { RunCard } from "@/components/runs/RunCard";
import { LinkedRuns } from "@/components/runs/LinkedRuns";
import {
  hrSourceChoices,
  rpeBandsHint,
  rpeChoices,
  toRunRow,
  type LinkableWorkout,
  type RawRun,
  type StoredRun,
} from "@/lib/runs";
import {
  buildDayView,
  buildMonthView,
  buildWeekView,
  buildYearView,
  focusNumbers,
  type CalendarItem,
  type YearFocus,
} from "@/lib/calendar";
import {
  WORKOUT_KINDS,
  lightenedDistance,
  offeredFractions,
  plannedDistance,
  sessionActions,
  type SessionCandidate,
  type StoredWorkoutWithRuns,
  type WorkoutDetail,
} from "@/lib/plan";
import { tokens, type TokenGroup, type TokenLayer } from "@/lib/design/tokens";
import { ModePreview, TokenValue } from "./mode-preview";
import { MoveDemo } from "./move-demo";
import { RunDemo } from "./run-demo";
import { WorkoutDemo } from "./workout-demo";

export const metadata: Metadata = {
  title: "Design system · sub80",
  robots: { index: false, follow: false },
};

/** Synthetic sessions, shaped like rows of planned_workouts. */
const sampleWorkouts = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    generated_key: "w22-d1",
    planned_date: "2027-03-16",
    kind: "threshold",
    title: "Threshold 3 × 12′ (2′ jog)",
    is_key: true,
    target_distance_m: 11000,
    week_index: 22,
    pace_zone: "T",
    strides: false,
    status: "planned",
    day_slot: 0,
    runs: [],
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    generated_key: "w22-d3",
    planned_date: "2027-03-18",
    kind: "easy",
    title: "Easy run + 6 strides",
    is_key: false,
    target_distance_m: 8500,
    week_index: 22,
    pace_zone: "E",
    strides: true,
    status: "planned",
    day_slot: 0,
    runs: [],
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    // Null: a row added by hand or by the coach, not by the generator.
    generated_key: null,
    planned_date: "2027-03-21",
    kind: "race",
    title: "RACE: 10k",
    is_key: true,
    target_distance_m: 14000,
    week_index: 22,
    pace_zone: "10K",
    strides: false,
    status: "planned",
    day_slot: 0,
    runs: [],
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    generated_key: null,
    planned_date: "2027-03-19",
    kind: "tt",
    title: "30′ time trial",
    is_key: true,
    target_distance_m: 9000,
    week_index: 22,
    pace_zone: "T",
    strides: false,
    status: "planned",
    day_slot: 0,
    runs: [],
  },
  {
    // A double day, sharing 2027-03-19 with the time trial above. Slot 1, so
    // it renders second in the week view and gives the month cell its second
    // marker: the two-per-day case needs a specimen like any other state.
    //
    // It is also the DONE one: a run is logged against it, which is what makes
    // a session done, so its status reads completed and the day it shares with
    // the time trial is one of two done. Both states on one cell is the point.
    id: "00000000-0000-4000-8000-000000000005",
    generated_key: null,
    planned_date: "2027-03-19",
    kind: "easy",
    title: "Easy shakeout",
    is_key: false,
    target_distance_m: 5000,
    week_index: 22,
    pace_zone: "E",
    strides: false,
    status: "completed",
    day_slot: 1,
    runs: [
      {
        id: "00000000-0000-4000-8000-00000000000a",
        started_at: "2027-03-19T17:40:00Z",
        // A little over the 5 km asked for, which is the normal case and what
        // the "5.4 / 5.0 km" line on the card exists to show.
        distance_m: 5400,
        duration_s: 1680,
        avg_hr: 139,
        hr_source: "strap",
        rpe: 3,
      },
    ],
  },
] satisfies StoredWorkoutWithRuns[];

/** The VDOT the sample paces are derived from: the plan's starting point. */
const SAMPLE_VDOT = 47;

/**
 * A Thursday in plan week 22, which is the week the sample rows sit in. Today
 * is the same day, so the "today" marking shows up in every view.
 */
const SAMPLE_DATE = "2027-03-18";

/**
 * Synthetic runs, shaped like rows of activities. Every one is in the past
 * relative to SAMPLE_DATE, since a run cannot be dated in the future.
 *
 * The two with a zone carry BOTH snapshots, because a zone without the VDOT it
 * was read at cannot be turned back into a pace window and the row would then
 * have nothing factual to say.
 */
const sampleRuns = [
  {
    id: "00000000-0000-4000-8000-00000000aa01",
    started_at: "2027-03-16T06:30:00Z",
    start_time_known: true,
    distance_m: 11_000,
    duration_s: 2_820,
    avg_hr: 162,
    hr_source: "strap",
    rpe: 7,
    notes: "Held the pace to the last rep, then it got honest.",
    planned_pace_zone: "T",
    vdot_used: 47,
    source: "manual",
    planned_workout_id: "00000000-0000-4000-8000-000000000001",
    planned_workout: {
      title: "Threshold 3 × 12′ (2′ jog)",
      planned_date: "2027-03-16",
      pace_zone: "T",
      status: "completed",
    },
  },
  {
    // No start time, no effort, no heart rate: the sparse row.
    id: "00000000-0000-4000-8000-00000000aa02",
    started_at: "2027-03-15T11:00:00Z",
    start_time_known: false,
    distance_m: 8_500,
    duration_s: 2_970,
    avg_hr: null,
    hr_source: null,
    rpe: null,
    notes: null,
    planned_pace_zone: null,
    vdot_used: null,
    source: "manual",
    planned_workout_id: null,
    planned_workout: null,
  },
  {
    // Wrist rather than strap, and a long note to cut.
    id: "00000000-0000-4000-8000-00000000aa03",
    started_at: "2027-03-14T08:00:00Z",
    start_time_known: true,
    distance_m: 21_000,
    duration_s: 7_380,
    avg_hr: 148,
    hr_source: "wrist",
    rpe: 5,
    notes:
      "Long one round the lake. Felt flat for the first half hour and then much better, which is usually what happens when I start too fast on the first kilometre and spend the rest of it paying for it.",
    planned_pace_zone: "E",
    vdot_used: 47,
    source: "manual",
    planned_workout_id: "00000000-0000-4000-8000-000000000002",
    planned_workout: {
      title: "Long run",
      planned_date: "2027-03-14",
      pace_zone: "E",
      status: "completed",
    },
  },
] satisfies StoredRun[];

/** Sessions the picker can offer, with how many runs each already has. */
const sampleLinkable = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Threshold 3 × 12′ (2′ jog)",
    planned_date: "2027-03-16",
    pace_zone: "T",
    status: "completed",
    target_distance_m: 11_000,
    run_count: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    title: "Easy run + 6 strides",
    planned_date: "2027-03-18",
    pace_zone: "E",
    status: "planned",
    target_distance_m: 8_500,
    run_count: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    title: "Easy run",
    planned_date: "2027-03-17",
    pace_zone: "E",
    status: "skipped",
    target_distance_m: 9_000,
    run_count: 0,
  },
] satisfies LinkableWorkout[];

/** What the form starts with on /design: a run already half typed. */
const sampleDraft = {
  date: "2027-03-16",
  time: "07:30",
  distanceKm: "11",
  duration: "47:00",
  avgHr: "162",
  hrSource: "strap",
  rpe: "7",
  notes: "Held the pace to the last rep.",
  plannedWorkoutId: "00000000-0000-4000-8000-000000000001",
} satisfies RawRun;

const sampleInput = {
  date: SAMPLE_DATE,
  today: SAMPLE_DATE,
  workouts: sampleWorkouts,
  vdot: SAMPLE_VDOT,
};

/**
 * The easy run, which the picker and the dialog specimens talk about. Found by
 * title rather than by index, so reordering the samples above cannot silently
 * point these at a different session.
 */
const easyRun = sampleWorkouts.find((workout) => workout.kind === "easy");
const sampleSession = {
  id: easyRun?.id ?? "",
  title: easyRun?.title ?? "",
  date: easyRun?.planned_date ?? SAMPLE_DATE,
};

/**
 * The detail view's specimens: one row per state the page can be in.
 *
 * Built from the same synthetic rows as the calendar, widened with the three
 * columns only the detail view reads. A past date and a lightened day are
 * states, not edge cases: each withholds a different set of actions.
 */
const sampleDetails = (() => {
  /**
   * Written out rather than spread from a calendar sample: the detail view
   * reads three more columns, and a specimen that is explicit about all of
   * them is easier to read than one assembled from two halves.
   */
  const base = {
    id: "00000000-0000-4000-8000-000000000001",
    generated_key: "w22-d1",
    planned_date: "2027-03-16",
    kind: "threshold",
    title: "Threshold 3 × 12′ (2′ jog)",
    is_key: true,
    target_distance_m: 14_000,
    week_index: 22,
    pace_zone: "T",
    strides: false,
    status: "planned",
    day_slot: 0,
    notes: null,
    original_distance_m: null,
    target_duration_s: null,
  } satisfies WorkoutDetail;

  const detail = (overrides: Partial<WorkoutDetail> = {}): WorkoutDetail => ({
    ...base,
    ...overrides,
  });

  return {
    planned: detail(),
    withNotes: detail({
      notes: "Calves tight on the second rep. Eased off and they settled.",
    }),
    lightened: detail({ target_distance_m: 11_000, original_distance_m: 14_000 }),
    asLightAsItGoes: detail({
      target_distance_m: 8_500,
      original_distance_m: 14_000,
    }),
    done: detail({ status: "completed" }),
    skipped: detail({ status: "skipped", planned_date: "2026-10-21", week_index: 1 }),
    // Plan week 1, which began 2026-10-19: before SAMPLE_DATE, so the lighter
    // actions are withheld while done and skipped are not.
    past: detail({ planned_date: "2026-10-21", week_index: 1, status: "planned" }),
    // A race week session, which has a race pace rather than a training zone
    // and so takes the zoneUse fallback.
    race: detail({ pace_zone: "HM", kind: "race", title: "Half marathon" }),
  };
})();

const sampleFacts = [
  { label: "planned", workout: sampleDetails.planned },
  { label: "with notes", workout: sampleDetails.withNotes },
  { label: "made lighter", workout: sampleDetails.lightened },
  { label: "done", workout: sampleDetails.done },
  { label: "in the past", workout: sampleDetails.past },
  { label: "a race, so a race pace", workout: sampleDetails.race },
] as const;

/**
 * What the page computes for the island, repeated here for each state.
 *
 * `runs` is the second input that matters: a session with a run against it
 * offers nothing at all, which is a specimen worth being able to look at.
 */
function actionProps(
  workout: WorkoutDetail,
  runs: readonly { id: string }[] = [],
): WorkoutActionsProps {
  const candidate: SessionCandidate = {
    id: workout.id,
    status: workout.status,
    planned_date: workout.planned_date,
    target_distance_m: workout.target_distance_m,
    original_distance_m: workout.original_distance_m,
  };
  const planned = plannedDistance(candidate);

  return {
    workoutId: workout.id,
    actions: sessionActions(candidate, runs, SAMPLE_DATE),
    lighten:
      planned === null
        ? []
        : offeredFractions(candidate).map((by) => ({
            by,
            toM: lightenedDistance(planned, by),
          })),
    restoreToM: workout.original_distance_m,
  };
}

const sampleActions = [
  { label: "planned", props: actionProps(sampleDetails.planned) },
  { label: "already at -20%", props: actionProps(sampleDetails.lightened) },
  {
    label: "as light as it goes",
    props: actionProps(sampleDetails.asLightAsItGoes),
  },
  { label: "in the past", props: actionProps(sampleDetails.past) },
  { label: "skipped", props: actionProps(sampleDetails.skipped) },
  {
    label: "a run is logged against it",
    props: actionProps(sampleDetails.done, [{ id: sampleRuns[0]!.id }]),
  },
] as const;

const sampleWeek = buildWeekView(sampleInput);
const sampleMonth = buildMonthView(sampleInput);
const sampleDay = buildDayView(sampleInput);
const sampleItems: readonly CalendarItem[] = sampleWeek.days.flatMap(
  (day) => day.items,
);

/**
 * A year of synthetic totals: one session and one run a month, growing, with
 * March over its plan and a couple of months still empty.
 *
 * Shaped like the rows the year read returns, not like sessions: the year view
 * adds up two numbers a month and knows nothing else about them.
 */
const sampleYearPlanned = [
  { planned_date: "2027-01-11", target_distance_m: 180_000 },
  { planned_date: "2027-02-08", target_distance_m: 200_000 },
  { planned_date: "2027-03-08", target_distance_m: 210_000 },
  // A rest month in the plan: null is a rest day, which counts as 0.
  { planned_date: "2027-04-05", target_distance_m: null },
  { planned_date: "2027-05-10", target_distance_m: 230_000 },
  { planned_date: "2027-06-07", target_distance_m: 240_000 },
];

const sampleYearRuns = [
  { started_at: "2027-01-12T09:00:00Z", distance_m: 164_000 },
  { started_at: "2027-02-09T09:00:00Z", distance_m: 198_000 },
  // Over its plan, which is what the chart has to be able to draw.
  { started_at: "2027-03-09T09:00:00Z", distance_m: 232_000 },
  { started_at: "2027-04-06T09:00:00Z", distance_m: 90_000 },
];

const sampleYear = buildYearView({
  date: SAMPLE_DATE,
  today: SAMPLE_DATE,
  planned: sampleYearPlanned,
  runs: sampleYearRuns,
});

/** A year the athlete has not reached: no plan, no runs, no axis. */
const sampleEmptyYear = buildYearView({
  date: "2028-06-01",
  today: SAMPLE_DATE,
  planned: [],
  runs: [],
});

/** The month in focus, run past its plan: 0 to go, over 100%, bar clamped. */
const sampleOverFocus: YearFocus = {
  monthName: "March",
  ...focusNumbers(232_000, 210_000),
};

/** Nothing planned this month, so there is no percentage to state. */
const sampleUnplannedFocus: YearFocus = {
  monthName: "April",
  ...focusNumbers(90_000, 0),
};

/** A bordered surface, as the component cards on this page use. */
const card = [
  "flex flex-col gap-stack-md rounded-surface bg-surface p-inset-md",
  "border-(length:--border-width-default) border-default",
].join(" ");

const layers: { layer: TokenLayer; title: string }[] = [
  { layer: "primitive", title: "Primitives" },
  { layer: "semantic", title: "Semantic" },
  { layer: "component", title: "Component" },
];

function Specimen({ kind, name }: { kind: TokenGroup["kind"]; name: string }) {
  const value = `var(${name})`;
  switch (kind) {
    case "color":
      return (
        <span
          className="size-(--space-10) shrink-0 rounded-control border-(length:--border-width-default) border-default"
          style={{ background: value }}
        />
      );
    case "radius":
      return (
        <span
          className="size-(--space-10) shrink-0 bg-accent"
          style={{ borderRadius: value }}
        />
      );
    case "space":
    case "size":
      return <span className="h-(--space-2) shrink-0 bg-accent" style={{ width: value }} />;
    case "border-width":
      return <span className="w-(--space-10) shrink-0 bg-accent" style={{ height: value }} />;
    case "shadow":
      // On a surface, with a gap round it: a shadow is only legible against
      // the background it is meant to lift off.
      return (
        <span className="inline-flex p-inset-sm">
          <span
            className="size-(--space-8) shrink-0 rounded-control bg-surface"
            style={{ boxShadow: value }}
          />
        </span>
      );
    case "font-family":
      return <span style={{ fontFamily: value }}>Pace 3:47/km</span>;
    case "font-size":
      return <span style={{ fontSize: value }}>Aa</span>;
    case "font-weight":
      return <span style={{ fontWeight: value }}>Threshold</span>;
    case "line-height":
      return (
        <span className="max-w-(--space-16) text-small" style={{ lineHeight: value }}>
          Easy run, then strides
        </span>
      );
  }
}

function Group({ group }: { group: TokenGroup }) {
  return (
    <div className="flex flex-col gap-stack-sm rounded-surface border-(length:--border-width-default) border-default bg-surface p-inset-md">
      <h3 className="text-heading-sm">{group.name}</h3>
      <ul className="flex flex-col gap-stack-sm">
        {group.tokens.map((name) => (
          <li key={name} className="flex items-center gap-inline-md">
            <Specimen kind={group.kind} name={name} />
            <span className="flex min-w-0 flex-col">
              <code className="font-code text-small break-all">{name}</code>
              <TokenValue name={name} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every workout kind, as a label and as a month-grid marker. */
function KindBadges({ size }: { size: "label" | "short" }) {
  return (
    <div className="flex flex-wrap gap-inline-sm">
      {WORKOUT_KINDS.map((kind) => (
        <KindBadge key={kind} kind={kind} size={size} />
      ))}
    </div>
  );
}

function Sample() {
  return (
    <>
      <div className="flex flex-wrap gap-inline-sm">
        <Button>Log run</Button>
        <Button disabled>Disabled</Button>
      </div>
      <p className="text-body">
        Primary text on canvas. <span className="text-secondary">Secondary text.</span>{" "}
        <span className="text-accent">Accent.</span> <span className="text-danger">Danger.</span>
      </p>
      <div className="rounded-surface bg-raised p-inset-sm text-small">Raised surface</div>
      <WorkoutList items={sampleWorkouts.slice(0, 1)} vdot={SAMPLE_VDOT} />
      {/* The chart in every theme and palette: the two series and the current
          month's accent have to stay apart in all four. */}
      <YearChart year={sampleYear} headingLevel={3} />
      <KindBadges size="label" />
      <KindBadges size="short" />
      <div className="flex flex-wrap items-center gap-inline-md">
        <DoneBadge />
        <DoneBadge size="short" kindLabel="Easy" />
      </div>
      {/* The planned card and the done one, so both tints are in the matrix. */}
      {sampleItems.slice(0, 1).map((item) => (
        <WorkoutCard key={item.id} item={item} />
      ))}
      {sampleItems
        .filter((item) => item.runs.length > 0)
        .slice(0, 1)
        .map((item) => (
          <WorkoutCard key={`done-${item.id}`} item={item} />
        ))}
    </>
  );
}

export default function DesignPage() {
  return (
    <ModePreview sample={<Sample />}>
      <main className="flex flex-col gap-stack-lg p-inset-lg">
        <h1 className="text-heading-lg">Design system</h1>

        <section aria-labelledby="components" className="flex flex-col gap-stack-md">
          <h2 id="components" className="text-heading-md">
            Components
          </h2>
          <div className="flex flex-col gap-stack-sm rounded-surface border-(length:--border-width-default) border-default bg-surface p-inset-md">
            <h3 className="text-heading-sm">Button</h3>
            <div className="flex flex-wrap gap-inline-sm">
              <Button>Default</Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
          <div className="flex flex-col gap-stack-md rounded-surface border-(length:--border-width-default) border-default bg-surface p-inset-md">
            <h3 className="text-heading-sm">TextField</h3>
            <TextField id="design-field-default" label="Email" hint="We send a 6-digit code." />
            <TextField id="design-field-error" label="Code" defaultValue="12" error="Enter the 6-digit code." />
            <TextField id="design-field-disabled" label="Disabled" disabled />
          </div>
          <div className={card}>
            <h3 className="text-heading-sm">TextArea</h3>
            <TextArea
              id="design-textarea-default"
              label="How did it feel"
              hint="Anything worth remembering about the run."
              rows={3}
            />
            <TextArea
              id="design-textarea-error"
              label="How did it feel"
              defaultValue="Too long."
              error="What you write is at most 2000 characters."
              rows={3}
            />
            <TextArea id="design-textarea-disabled" label="Disabled" rows={2} disabled />
          </div>
          <div className={card}>
            <h3 className="text-heading-sm">ChoiceGroup</h3>
            <p className="text-small text-secondary">
              Native radios, so the arrow keys and the grouping come from the
              browser and the field submits without JavaScript. Each segment is
              at least 44px.
            </p>
            <ChoiceGroup
              name="design-rpe"
              legend="How hard was it?"
              hint={rpeBandsHint()}
              options={rpeChoices()}
              defaultValue="4"
            />
            <ChoiceGroup
              name="design-hr-source"
              legend="Where did the heart rate come from?"
              options={hrSourceChoices()}
            />
            <ChoiceGroup
              name="design-choice-error"
              legend="With an error"
              options={hrSourceChoices()}
              error="Say where the heart rate came from."
            />
            <ChoiceGroup
              name="design-choice-disabled"
              legend="Disabled"
              options={hrSourceChoices()}
              defaultValue="strap"
              disabled
            />
          </div>
          <div className="flex flex-col gap-stack-md rounded-surface border-(length:--border-width-default) border-default bg-surface p-inset-md">
            <h3 className="text-heading-sm">WorkoutList</h3>
            <WorkoutList items={sampleWorkouts} vdot={SAMPLE_VDOT} />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">KindBadge</h3>
            <p className="text-small text-secondary">
              Ten kinds, each with its own hue and its own word. The short marker
              keeps the full name for screen readers.
            </p>
            <KindBadges size="label" />
            <KindBadges size="short" />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">DoneBadge</h3>
            <p className="text-small text-secondary">
              A session that happened. Filled, where a planned marker is a pale
              tint, and carrying a check and the word: the cue is never the
              colour on its own. In a month cell the short marker takes the kind
              marker&rsquo;s place — at seven columns on a phone there is room
              for one glyph — and speaks the kind it replaced.
            </p>
            <div className="flex flex-wrap items-center gap-inline-md">
              <DoneBadge />
              <DoneBadge size="short" kindLabel="Easy" />
              {/* Beside the planned marker it replaces, to see the pair. */}
              <KindBadge kind="easy" size="short" />
            </div>
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">WorkoutCard</h3>
            <p className="text-small text-secondary">
              The last of these is done: a run is logged against it, which is
              what makes a session done. It takes the check badge, the done tint
              and the distance actually run over the distance asked for. In the
              day view the run&rsquo;s own numbers become the content and the
              plan&rsquo;s target drops to one small line beneath. No verdict is
              passed on the difference between the two.
            </p>
            <p className="text-small text-secondary">Compact, as in a week column.</p>
            <div className="flex flex-col gap-stack-sm">
              {sampleItems.map((item) => (
                <WorkoutCard key={item.id} item={item} />
              ))}
            </div>
            <p className="text-small text-secondary">Full, as in the day view.</p>
            <div className="flex flex-col gap-stack-sm">
              {sampleItems.map((item) => (
                <WorkoutCard key={`full-${item.id}`} item={item} size="full" />
              ))}
            </div>
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">Calendar · week</h3>
            <Calendar model={sampleWeek} today={SAMPLE_DATE} titleLevel={4} />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">Calendar · month</h3>
            <Calendar model={sampleMonth} today={SAMPLE_DATE} titleLevel={4} />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">Calendar · day</h3>
            <Calendar model={sampleDay} today={SAMPLE_DATE} titleLevel={4} />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">Calendar · year</h3>
            <p className="text-small text-secondary">
              Unskinned: correct numbers, names, contrast and hit areas, with
              the visual design still to come. Twelve columns with no gaps
              between them, each one a link into that month — about 25px wide
              and the full height of the plot at 390px.
            </p>
            <Calendar model={sampleYear} today={SAMPLE_DATE} titleLevel={4} />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">Calendar · year, nothing in it</h3>
            <p className="text-small text-secondary">
              A year the athlete has not reached. No bars and no scale: a
              0-to-10 axis with nothing on it would look like data. The
              previous button is live and the next one is a disabled control,
              because 2028 is the last year the plan runs through.
            </p>
            <Calendar model={sampleEmptyYear} today={SAMPLE_DATE} titleLevel={4} />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">BigNumber</h3>
            <p className="text-small text-secondary">
              One measurement and the line that gives it a scale. Not a card:
              it is the answer to the heading above it.
            </p>
            <BigNumber
              eyebrow="The big picture"
              value={sampleYear.loggedKm}
              unit="km"
              caption={`of ${sampleYear.plannedKm} km planned`}
            />
            <BigNumber eyebrow="The big picture" value={0} unit="km" caption="of 0 km planned" />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">YearChart</h3>
            <p className="text-small text-secondary">
              Logged against planned on one axis. The planned bar is quiet on
              purpose and fails 3:1 against the surface, so its outline carries
              the meaning instead; the series are named in words as well as
              filled. March is over its plan here, and July onwards has neither
              a plan nor a run, so those months draw no bar at all.
            </p>
            <YearChart year={sampleYear} headingLevel={4} />
            <YearChart year={sampleEmptyYear} headingLevel={4} />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">FocusCard</h3>
            <p className="text-small text-secondary">
              &ldquo;Of planned&rdquo;, never &ldquo;of goal&rdquo;: a month has
              no goal, only a plan that asked for a distance. Run past the plan
              there is nothing left to go, the percentage still says 110% and
              the bar stops at the end of its track. With nothing planned there
              is no percentage and no bar — a fraction of zero is a question
              with no answer.
            </p>
            {sampleYear.focus === null ? null : (
              <FocusCard focus={sampleYear.focus} headingLevel={4} />
            )}
            <FocusCard focus={sampleOverFocus} headingLevel={4} />
            <FocusCard focus={sampleUnplannedFocus} headingLevel={4} />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">CalendarSkeleton</h3>
            <CalendarSkeleton />
          </div>

          <MoveDemo
            week={sampleWeek}
            month={sampleMonth}
            today={SAMPLE_DATE}
            sample={sampleSession}
          />

          <WorkoutDemo
            facts={sampleFacts}
            vdot={SAMPLE_VDOT}
            actions={sampleActions}
          />

          <div className={card}>
            <h3 className="text-heading-sm">RunCard</h3>
            <p className="text-small text-secondary">
              The whole card is the link. The heart rate always names its
              source, because a strap reading and a wrist one are never mixed.
            </p>
            <ul className="flex flex-col gap-stack-md">
              {sampleRuns.map((run) => (
                <RunCard key={run.id} run={toRunRow(run)} />
              ))}
            </ul>
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">LinkedRuns</h3>
            <p className="text-small text-secondary">
              The run is what makes the session done, so this panel being here
              IS the completion. Editing the run is the only thing offered from
              it; with no run it renders nothing at all and the session page
              offers Log run instead.
            </p>
            <LinkedRuns runs={[sampleRuns[0]!]} />
          </div>

          <div className={card}>
            <h3 className="text-heading-sm">LinkedRuns · two runs on one session</h3>
            <p className="text-small text-secondary">
              A legitimate day: the log form warns about a second run and the
              athlete confirms. Each gets its own summary and its own Edit run.
            </p>
            <LinkedRuns runs={sampleRuns.slice(0, 2)} />
          </div>

          <RunDemo
            initial={sampleDraft}
            workouts={sampleLinkable}
            today={SAMPLE_DATE}
            vdot={SAMPLE_VDOT}
          />
        </section>

        {layers.map(({ layer, title }) => (
          <section key={layer} aria-labelledby={layer} className="flex flex-col gap-stack-md">
            <h2 id={layer} className="text-heading-md">
              {title}
            </h2>
            <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-3">
              {tokens[layer].map((group) => (
                <Group key={group.name} group={group} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </ModePreview>
  );
}
