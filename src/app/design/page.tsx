import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { WorkoutList } from "@/components/WorkoutList";
import { Calendar } from "@/components/calendar/Calendar";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { KindBadge } from "@/components/calendar/KindBadge";
import { WorkoutCard } from "@/components/calendar/WorkoutCard";
import type { WorkoutActionsProps } from "@/components/workout/WorkoutActions";
import {
  buildDayView,
  buildMonthView,
  buildWeekView,
  lightenRejectMessage,
  type CalendarItem,
} from "@/lib/calendar";
import {
  LIGHTEN_FRACTIONS,
  WORKOUT_KINDS,
  lightenedDistance,
  offeredFractions,
  plannedDistance,
  validateLighten,
  type StoredWorkout,
  type WorkoutDetail,
} from "@/lib/plan";
import { tokens, type TokenGroup, type TokenLayer } from "@/lib/design/tokens";
import { ModePreview, TokenValue } from "./mode-preview";
import { MoveDemo } from "./move-demo";
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
  },
  {
    // A double day, sharing 2027-03-19 with the time trial above. Slot 1, so
    // it renders second in the week view and gives the month cell its second
    // marker: the two-per-day case needs a specimen like any other state.
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
    status: "planned",
    day_slot: 1,
  },
] satisfies StoredWorkout[];

/** The VDOT the sample paces are derived from: the plan's starting point. */
const SAMPLE_VDOT = 47;

/**
 * A Thursday in plan week 22, which is the week the sample rows sit in. Today
 * is the same day, so the "today" marking shows up in every view.
 */
const SAMPLE_DATE = "2027-03-18";

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

/** What the page computes for the island, repeated here for each state. */
function actionProps(workout: WorkoutDetail): WorkoutActionsProps {
  const candidate = {
    id: workout.id,
    status: workout.status,
    planned_date: workout.planned_date,
    target_distance_m: workout.target_distance_m,
    original_distance_m: workout.original_distance_m,
  };
  const planned = plannedDistance(candidate);
  const checks = LIGHTEN_FRACTIONS.map((by) =>
    validateLighten({ workout: candidate, by, today: SAMPLE_DATE }),
  );
  const blocking = checks.find(
    (check) => !check.ok && check.reason.code !== "would_raise",
  );

  return {
    workoutId: workout.id,
    status: workout.status,
    notes: workout.notes,
    lighten:
      planned === null
        ? []
        : offeredFractions(candidate).map((by) => ({
            by,
            toM: lightenedDistance(planned, by),
          })),
    restoreToM: workout.original_distance_m,
    lightenWithheld:
      !checks.some((check) => check.ok) && blocking?.ok === false
        ? lightenRejectMessage(blocking.reason)
        : null,
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
  { label: "done", props: actionProps(sampleDetails.done) },
] as const;

const sampleWeek = buildWeekView(sampleInput);
const sampleMonth = buildMonthView(sampleInput);
const sampleDay = buildDayView(sampleInput);
const sampleItems: readonly CalendarItem[] = sampleWeek.days.flatMap(
  (day) => day.items,
);

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
      <KindBadges size="label" />
      <KindBadges size="short" />
      {sampleItems.slice(0, 1).map((item) => (
        <WorkoutCard key={item.id} item={item} />
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
            <h3 className="text-heading-sm">WorkoutCard</h3>
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
