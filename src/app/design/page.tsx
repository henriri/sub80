import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { WorkoutList } from "@/components/WorkoutList";
import type { StoredWorkout } from "@/lib/plan";
import { tokens, type TokenGroup, type TokenLayer } from "@/lib/design/tokens";
import { ModePreview, TokenValue } from "./mode-preview";

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
  },
] satisfies StoredWorkout[];

/** The VDOT the sample paces are derived from: the plan's starting point. */
const SAMPLE_VDOT = 47;

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
