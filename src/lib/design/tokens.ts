/**
 * Index of every token in src/styles/tokens.css, grouped by layer. The /design
 * page renders from this list. tokens.test.ts keeps it in sync with the CSS.
 */

export type TokenKind =
  | "color"
  | "radius"
  | "space"
  | "size"
  | "border-width"
  | "shadow"
  | "font-family"
  | "font-size"
  | "font-weight"
  | "line-height";

export type TokenGroup = {
  name: string;
  kind: TokenKind;
  tokens: readonly string[];
};

export type TokenLayer = "primitive" | "semantic" | "component";

const range = (prefix: string, steps: readonly (string | number)[]) =>
  steps.map((step) => `${prefix}-${step}`);

const ramp = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** The four steps a workout-kind hue needs: two per theme. */
const kindRamp = [100, 300, 900, 950];

/** Every workout kind, in the order `WORKOUT_KINDS` declares them. */
const kinds = [
  "easy",
  "long",
  "hills",
  "steady",
  "sweet",
  "threshold",
  "interval",
  "tt",
  "race",
  "rest",
] as const;

/** `--kind-easy` and `--kind-easy-fg` for every kind. */
const kindTokens = kinds.flatMap((kind) => [`--kind-${kind}`, `--kind-${kind}-fg`]);

export const tokens: Record<TokenLayer, readonly TokenGroup[]> = {
  primitive: [
    {
      name: "Neutral",
      kind: "color",
      tokens: range("--color-neutral", [0, ...ramp, 1000]),
    },
    { name: "Blue", kind: "color", tokens: range("--color-blue", ramp) },
    { name: "Green", kind: "color", tokens: range("--color-green", ramp) },
    {
      name: "Red",
      kind: "color",
      tokens: range("--color-red", [100, 300, 400, 600, 900, 950]),
    },
    { name: "Orange", kind: "color", tokens: range("--color-orange", kindRamp) },
    { name: "Amber", kind: "color", tokens: range("--color-amber", kindRamp) },
    { name: "Teal", kind: "color", tokens: range("--color-teal", kindRamp) },
    { name: "Cyan", kind: "color", tokens: range("--color-cyan", kindRamp) },
    { name: "Violet", kind: "color", tokens: range("--color-violet", kindRamp) },
    {
      name: "Magenta",
      kind: "color",
      tokens: range("--color-magenta", kindRamp),
    },
    {
      name: "Radius",
      kind: "radius",
      tokens: range("--radius", [0, 2, 4, 8, 12, 16, "full"]),
    },
    {
      name: "Space",
      kind: "space",
      tokens: range("--space", [0, "0-5", 1, 2, 3, 4, 5, 6, 8, 10, 12, 16]),
    },
    {
      name: "Size",
      kind: "size",
      tokens: ["--size-touch-target", "--size-dialog-max"],
    },
    {
      name: "Scrim",
      kind: "color",
      tokens: ["--color-scrim-dim", "--color-scrim-deep"],
    },
    {
      name: "Border width",
      kind: "border-width",
      tokens: range("--border-width", [1, 2]),
    },
    {
      name: "Shadow",
      kind: "shadow",
      tokens: ["--shadow-soft", "--shadow-deep"],
    },
    {
      name: "Font family",
      kind: "font-family",
      tokens: range("--font-family", ["sans", "serif", "mono"]),
    },
    {
      name: "Font size",
      kind: "font-size",
      tokens: range("--font-size", ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"]),
    },
    {
      name: "Font weight",
      kind: "font-weight",
      tokens: range("--font-weight", ["regular", "medium", "bold"]),
    },
    {
      name: "Line height",
      kind: "line-height",
      tokens: range("--line-height", ["tight", "normal"]),
    },
  ],
  semantic: [
    {
      name: "Background",
      kind: "color",
      tokens: range("--color-bg", ["canvas", "surface", "raised"]),
    },
    {
      name: "Text",
      kind: "color",
      tokens: range("--color-text", ["primary", "secondary", "on-accent"]),
    },
    {
      name: "Accent and status",
      kind: "color",
      tokens: [
        "--color-accent",
        "--color-accent-hover",
        "--color-focus-ring",
        "--color-danger",
        "--color-border-default",
        "--color-scrim",
      ],
    },
    {
      name: "Drop state",
      kind: "color",
      tokens: [
        ...range("--color-drop-valid", ["fg", "border"]),
        "--color-drop-valid",
        ...range("--color-drop-invalid", ["fg", "border"]),
        "--color-drop-invalid",
      ],
    },
    { name: "Elevation", kind: "shadow", tokens: ["--shadow-overlay"] },
    { name: "Workout kind", kind: "color", tokens: kindTokens },
    {
      name: "Radius",
      kind: "radius",
      tokens: range("--radius", ["control", "surface"]),
    },
    {
      name: "Space",
      kind: "space",
      tokens: [
        ...range("--space-inset", ["sm", "md", "lg"]),
        ...range("--space-stack", ["sm", "md", "lg"]),
        ...range("--space-inline", ["xs", "sm", "md"]),
        "--space-focus-offset",
      ],
    },
    {
      name: "Size",
      kind: "size",
      tokens: ["--size-touch-min", "--size-dialog-width"],
    },
    {
      name: "Border width",
      kind: "border-width",
      tokens: range("--border-width", ["default", "focus"]),
    },
    {
      name: "Font family",
      kind: "font-family",
      tokens: range("--font-family", ["body", "heading", "code"]),
    },
    {
      name: "Font size",
      kind: "font-size",
      tokens: range("--font-size", [
        "small",
        "body",
        "heading-sm",
        "heading-md",
        "heading-lg",
      ]),
    },
    {
      name: "Font weight",
      kind: "font-weight",
      tokens: range("--font-weight", ["body", "strong", "heading"]),
    },
    {
      name: "Line height",
      kind: "line-height",
      tokens: range("--line-height", ["body", "heading"]),
    },
  ],
  component: [
    {
      name: "Button colour",
      kind: "color",
      tokens: ["--button-bg", "--button-bg-hover", "--button-fg"],
    },
    { name: "Button radius", kind: "radius", tokens: ["--button-radius"] },
    {
      name: "Button space",
      kind: "space",
      tokens: ["--button-padding-x", "--button-padding-y"],
    },
    { name: "Button size", kind: "size", tokens: ["--button-min-height"] },
    {
      name: "Button type",
      kind: "font-family",
      tokens: ["--button-font-family"],
    },
    {
      name: "Button weight",
      kind: "font-weight",
      tokens: ["--button-font-weight"],
    },
    {
      name: "Field colour",
      kind: "color",
      tokens: [
        "--field-bg",
        "--field-fg",
        "--field-border",
        "--field-border-error",
      ],
    },
    { name: "Field radius", kind: "radius", tokens: ["--field-radius"] },
    {
      name: "Field space",
      kind: "space",
      tokens: ["--field-padding-x", "--field-padding-y"],
    },
    { name: "Field size", kind: "size", tokens: ["--field-min-height"] },
    {
      name: "Field type",
      kind: "font-family",
      tokens: ["--field-font-family"],
    },
    {
      name: "Calendar colour",
      kind: "color",
      tokens: [
        "--cal-cell-bg",
        "--cal-cell-bg-muted",
        "--cal-cell-border",
        "--cal-date-fg",
        "--cal-date-fg-muted",
        "--cal-today-bg",
        "--cal-today-ring",
        "--cal-event-border",
        "--cal-card-bg",
        "--cal-card-fg",
        "--cal-card-border",
        "--cal-header-bg",
        "--cal-weekday-fg",
        "--cal-drop-valid-bg",
        "--cal-drop-valid-fg",
        "--cal-drop-valid-border",
        "--cal-drop-invalid-bg",
        "--cal-drop-invalid-fg",
        "--cal-drop-invalid-border",
        "--cal-dialog-scrim",
      ],
    },
    {
      name: "Calendar elevation",
      kind: "shadow",
      tokens: ["--cal-drag-overlay-shadow", "--cal-dialog-shadow"],
    },
    { name: "Calendar dialog size", kind: "size", tokens: ["--cal-dialog-width"] },
    {
      name: "Calendar radius",
      kind: "radius",
      tokens: ["--cal-cell-radius", "--cal-card-radius", "--cal-marker-radius"],
    },
    {
      name: "Calendar space",
      kind: "space",
      tokens: [
        "--cal-cell-padding",
        "--cal-cell-gap",
        "--cal-grid-gap",
        "--cal-grid-cell-padding",
        "--cal-card-padding-x",
        "--cal-card-padding-y",
        "--cal-card-gap",
        "--cal-marker-size",
        "--cal-header-gap",
      ],
    },
    {
      name: "Calendar size",
      kind: "size",
      tokens: [
        "--cal-cell-min-size",
        "--cal-card-min-height",
        "--cal-nav-min-size",
      ],
    },
    {
      name: "Calendar border width",
      kind: "border-width",
      tokens: ["--cal-today-ring-width"],
    },
    { name: "Calendar type", kind: "font-family", tokens: ["--cal-marker-font"] },
    {
      name: "Calendar font size",
      kind: "font-size",
      tokens: ["--cal-marker-font-size"],
    },
  ],
};

export const modes = {
  theme: ["light", "dark"],
  palette: ["default", "forest"],
  radius: ["default", "sharp", "round"],
  type: ["default", "alt"],
  density: ["comfortable", "compact"],
} as const;

export type Modes = { [K in keyof typeof modes]: (typeof modes)[K][number] };

export const defaultModes: Modes = {
  theme: "light",
  palette: "default",
  radius: "default",
  type: "default",
  density: "comfortable",
};

/** The five root attributes, ready to spread onto an element. */
export function modeAttributes(m: Modes) {
  return {
    "data-theme": m.theme,
    "data-palette": m.palette,
    "data-radius": m.radius,
    "data-type": m.type,
    "data-density": m.density,
  };
}
