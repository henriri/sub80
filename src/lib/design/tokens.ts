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

export const tokens: Record<TokenLayer, readonly TokenGroup[]> = {
  primitive: [
    {
      name: "Neutral",
      kind: "color",
      tokens: range("--color-neutral", [0, ...ramp, 1000]),
    },
    { name: "Blue", kind: "color", tokens: range("--color-blue", ramp) },
    { name: "Green", kind: "color", tokens: range("--color-green", ramp) },
    { name: "Red", kind: "color", tokens: range("--color-red", [400, 600]) },
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
    { name: "Size", kind: "size", tokens: ["--size-touch-target"] },
    {
      name: "Border width",
      kind: "border-width",
      tokens: range("--border-width", [1, 2]),
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
      ],
    },
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
        ...range("--space-inline", ["sm", "md"]),
        "--space-focus-offset",
      ],
    },
    { name: "Size", kind: "size", tokens: ["--size-touch-min"] },
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
