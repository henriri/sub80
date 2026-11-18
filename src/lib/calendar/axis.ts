/**
 * A chart's y axis: a maximum and the ticks to draw, at values a person would
 * have chosen.
 *
 * Pure and framework-free, like the rest of src/lib/calendar. It knows nothing
 * about months or distances: it takes the largest value a plot has to hold and
 * answers with a scale.
 */

/** Steps a reader can divide in their head, scaled by powers of ten. */
const STEPS = [1, 2, 5, 10];

export type Axis = {
  /** The top of the plot. Always a multiple of the tick step. */
  max: number;
  /** Every tick from 0 to `max` inclusive, in ascending order. */
  ticks: number[];
};

/**
 * An axis for a plot whose largest bar is `max`, aiming for about
 * `targetTicks` intervals.
 *
 * Whole numbers only, with a step of at least 1: the values here are
 * kilometres, and an axis reading 0 · 0.2 · 0.4 for a month with 1 km in it
 * would be more precision than the measurement deserves.
 *
 * An empty plot -- a year with no plan and no runs -- gets `{ max: 0, ticks:
 * [0] }` rather than an invented scale. The chart renders no bars and says so
 * in words instead, which is honest where a 0-to-10 axis with nothing on it
 * would look like data.
 */
export function niceAxis(max: number, targetTicks = 4): Axis {
  if (!Number.isFinite(max)) throw new RangeError(`Not a finite maximum: ${max}`);
  if (!Number.isInteger(targetTicks) || targetTicks < 1) {
    throw new RangeError(`Not a tick count: ${targetTicks}`);
  }
  if (max <= 0) return { max: 0, ticks: [0] };

  const rough = Math.ceil(max) / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    STEPS.map((candidate) => candidate * magnitude).find((size) => size >= rough) ??
    // Unreachable: 10 * magnitude is always at least `rough`. Kept so the
    // function has no undefined branch rather than a non-null assertion.
    10 * magnitude;
  const size = Math.max(1, Math.round(step));

  const top = Math.ceil(max / size) * size;
  const ticks = [];
  for (let tick = 0; tick <= top; tick += size) ticks.push(tick);

  return { max: top, ticks };
}
