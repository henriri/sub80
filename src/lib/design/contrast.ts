/**
 * WCAG contrast for the tokens in src/styles/tokens.css, computed from the
 * file itself. Pure: the caller passes the CSS text, so nothing here reads the
 * disk or needs a DOM.
 *
 * Every colour primitive is written as `oklch(L C H)`, so the chain is
 * oklch -> OKLab -> linear sRGB -> relative luminance -> ratio. Linear sRGB is
 * exactly what WCAG's luminance formula wants, so there is no round trip
 * through gamma-encoded channels.
 */

/** The five root attributes, as values. */
export type ModeValues = Record<string, string>;

type Rule = { selectors: string[]; declarations: [string, string][] };

/** `[data-theme="dark"]`, or `[data-theme]` with no value. */
const ATTRIBUTE = /\[data-([a-z]+)(?:="([a-z]+)")?\]/g;
const VAR_ONLY = /^var\((--[a-z0-9-]+)\)$/;
const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/;

/** Rules in source order. Comments go first: they contain braces and colons. */
export function parseRules(css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];

  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] as string)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const declarations: [string, string][] = [];

    for (const declaration of (match[2] as string).split(";")) {
      const colon = declaration.indexOf(":");
      if (colon === -1) continue;
      const name = declaration.slice(0, colon).trim();
      if (!name.startsWith("--")) continue;
      declarations.push([name, declaration.slice(colon + 1).trim()]);
    }

    rules.push({ selectors, declarations });
  }

  return rules;
}

/**
 * Whether one selector matches a root carrying all five mode attributes.
 * `:root` always does, and so does an attribute selector with no value.
 */
function matches(selector: string, mode: ModeValues): boolean {
  if (selector === ":root") return true;
  const attributes = [...selector.matchAll(ATTRIBUTE)];
  if (attributes.length === 0) return false;
  return attributes.every(
    ([, attribute, value]) =>
      value === undefined || mode[attribute as string] === value,
  );
}

/**
 * Every custom property as it resolves on a root in `mode`. All the selectors
 * in tokens.css have equal specificity, so source order decides: a later rule
 * wins, which is how `[data-theme="dark"]` beats the `:root` in the light
 * block.
 */
export function modeVariables(css: string, mode: ModeValues): Map<string, string> {
  const resolved = new Map<string, string>();

  for (const rule of parseRules(css)) {
    if (!rule.selectors.some((selector) => matches(selector, mode))) continue;
    for (const [name, value] of rule.declarations) resolved.set(name, value);
  }

  return resolved;
}

/** Follows a `var(--x)` chain to the literal it ends at. */
export function resolveToken(variables: Map<string, string>, name: string): string {
  let value = variables.get(name);
  if (value === undefined) throw new Error(`${name} is not declared`);

  for (let hop = 0; hop < 16; hop++) {
    const indirect = VAR_ONLY.exec(value);
    if (!indirect) return value;
    const next = variables.get(indirect[1] as string);
    if (next === undefined) throw new Error(`${name} points at undeclared ${indirect[1]}`);
    value = next;
  }

  throw new Error(`The var() chain from ${name} does not end`);
}

/** Linear-light sRGB. Components outside 0..1 are outside the gamut. */
export type LinearRgb = { r: number; g: number; b: number };

export function linearRgb(color: string): LinearRgb {
  const match = OKLCH.exec(color);
  if (!match) throw new Error(`Not an oklch colour: ${color}`);

  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = (Number(match[3]) * Math.PI) / 180;

  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: 4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    g: -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    b: -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  };
}

/** Rounding in the matrices costs a little headroom at pure white. */
const GAMUT_SLACK = 0.002;

export function isInGamut({ r, g, b }: LinearRgb): boolean {
  return [r, g, b].every(
    (channel) => channel >= -GAMUT_SLACK && channel <= 1 + GAMUT_SLACK,
  );
}

/** WCAG relative luminance, straight off the linear channels. */
export const luminance = ({ r, g, b }: LinearRgb) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG contrast ratio, 1 to 21. Rounded down to 2 decimals, never up. */
export function contrastRatio(foreground: string, background: string): number {
  const first = luminance(linearRgb(foreground));
  const second = luminance(linearRgb(background));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return Math.floor(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}
