import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  isInGamut,
  linearRgb,
  modeVariables,
  resolveToken,
} from "./contrast";
import { defaultModes, modes, tokens } from "./tokens";

const css = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");

/** WCAG AA for body text, and for anything at body size. */
const AA_TEXT = 4.5;
/** WCAG AA for a border, ring or other non-text indicator. */
const AA_NON_TEXT = 3;

/** In the order WORKOUT_KINDS declares them. */
const KINDS = [
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

type Pair = { fg: string; bg: string };

/**
 * A kind label appears three ways: inside its own chip, as text on a card, and
 * as text on a greyed-out month cell. All three have to read.
 */
const textPairs: Pair[] = [
  ...KINDS.flatMap((kind) => [
    { fg: `--kind-${kind}-fg`, bg: `--kind-${kind}` },
    { fg: `--kind-${kind}-fg`, bg: "--color-bg-surface" },
    { fg: `--kind-${kind}-fg`, bg: "--cal-cell-bg-muted" },
  ]),
  { fg: "--cal-date-fg", bg: "--cal-cell-bg" },
  { fg: "--cal-date-fg", bg: "--cal-cell-bg-muted" },
  { fg: "--cal-date-fg", bg: "--cal-today-bg" },
  { fg: "--cal-date-fg-muted", bg: "--cal-cell-bg" },
  { fg: "--cal-date-fg-muted", bg: "--cal-cell-bg-muted" },
  { fg: "--cal-date-fg-muted", bg: "--cal-today-bg" },
  { fg: "--cal-card-fg", bg: "--cal-card-bg" },
  { fg: "--cal-weekday-fg", bg: "--cal-header-bg" },
  // The word in a drop target. It is the word, not the colour, that says
  // whether the day will take the session, so it has to read.
  { fg: "--cal-drop-valid-fg", bg: "--cal-drop-valid-bg" },
  { fg: "--cal-drop-invalid-fg", bg: "--cal-drop-invalid-bg" },
  // A session that happened. The numbers of what was run are the content of a
  // done card, and the check badge carries a glyph, so both have to read as
  // text -- and the card's own text sits on the done tint as well.
  { fg: "--cal-done-fg", bg: "--cal-done-bg" },
  { fg: "--cal-card-fg", bg: "--cal-done-bg" },
  { fg: "--cal-done-badge-fg", bg: "--cal-done-badge-bg" },
  // An option in a radio group, picked and not picked. The number inside it
  // IS the choice, so it has to read in both states.
  { fg: "--choice-fg", bg: "--choice-bg" },
  { fg: "--choice-fg", bg: "--choice-bg-hover" },
  { fg: "--choice-fg-selected", bg: "--choice-bg-selected" },
];

/** The ring round today carries meaning on its own, so it needs 3:1. */
const nonTextPairs: Pair[] = [
  { fg: "--cal-today-ring", bg: "--cal-today-bg" },
  { fg: "--cal-event-border", bg: "--cal-cell-bg" },
  // A drop target's outline, both against its own tint and against the cell
  // next to it, since the outline is what picks one cell out of seven.
  { fg: "--cal-drop-valid-border", bg: "--cal-drop-valid-bg" },
  { fg: "--cal-drop-valid-border", bg: "--cal-cell-bg" },
  { fg: "--cal-drop-invalid-border", bg: "--cal-drop-invalid-bg" },
  { fg: "--cal-drop-invalid-border", bg: "--cal-cell-bg" },
  // A done session's outline and its filled marker, each against its own tint
  // and against the cell beside it: the filled marker is what picks a finished
  // day out of a month grid, so it has to stand on its own.
  { fg: "--cal-done-border", bg: "--cal-done-bg" },
  { fg: "--cal-done-border", bg: "--cal-cell-bg" },
  { fg: "--cal-done-badge-bg", bg: "--cal-done-bg" },
  { fg: "--cal-done-badge-bg", bg: "--cal-cell-bg" },
  // An unpicked option's outline is what shows there is something to tap.
  { fg: "--choice-border", bg: "--choice-bg" },
];

const combinations = modes.theme.flatMap((theme) =>
  modes.palette.map((palette) => ({ theme, palette })),
);

describe.each(combinations)("$theme · $palette", ({ theme, palette }) => {
  const variables = modeVariables(css, { ...defaultModes, theme, palette });
  const ratio = ({ fg, bg }: Pair) =>
    contrastRatio(resolveToken(variables, fg), resolveToken(variables, bg));

  it.each(textPairs)("$fg on $bg meets AA for text", (pair) => {
    expect(ratio(pair), `${pair.fg} on ${pair.bg}`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(nonTextPairs)("$fg on $bg meets AA for a non-text mark", (pair) => {
    expect(ratio(pair), `${pair.fg} on ${pair.bg}`).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });
});

/**
 * The six hue ramps added for the workout kinds. Neutral, blue, green and red
 * predate them, and the vivid accent steps (blue 200 to 500, red 400 and 600)
 * sit a little outside sRGB on purpose, so they are not in this list.
 */
const KIND_RAMPS = ["Orange", "Amber", "Teal", "Cyan", "Violet", "Magenta"];

describe("workout-kind hue ramps", () => {
  const ramps = tokens.primitive
    .filter((group) => KIND_RAMPS.includes(group.name))
    .flatMap((group) => group.tokens);

  it("covers all six hues", () => {
    expect(ramps.length).toBe(KIND_RAMPS.length * 4);
  });

  it("stays inside the sRGB gamut, so nothing is clipped", () => {
    const variables = modeVariables(css, defaultModes);
    for (const name of ramps) {
      const value = resolveToken(variables, name);
      expect(isInGamut(linearRgb(value)), `${name}: ${value}`).toBe(true);
    }
  });
});
