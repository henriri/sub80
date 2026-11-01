import type { Metadata } from "next";
import { Button } from "@/components/Button";
import { tokens, type TokenGroup, type TokenLayer } from "@/lib/design/tokens";
import { ModePreview, TokenValue } from "./mode-preview";

export const metadata: Metadata = {
  title: "Design system · sub80",
  robots: { index: false, follow: false },
};

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
