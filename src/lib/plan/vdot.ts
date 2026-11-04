/**
 * The Daniels/Gilbert VDOT model. Pure, no framework imports: given a race
 * result it returns a VDOT, and given a VDOT it returns paces.
 *
 * The formulas are ported unchanged from the first app, expression for
 * expression, so the numbers an athlete has already seen stay the same.
 * A 1:20 half marathon is about VDOT 58.4.
 */

/** Training zones, slowest to fastest. */
export type TrainingZone = "E" | "S" | "SS" | "T" | "I" | "R";
/** Race distances the model can predict. */
export type RaceKey = "5K" | "10K" | "HM" | "M";
/** Everything a planned session can carry as its pace target. */
export type ZoneKey = TrainingZone | "5K" | "10K" | "HM";

export const ZONE_KEYS = [
  "E",
  "S",
  "SS",
  "T",
  "I",
  "R",
  "5K",
  "10K",
  "HM",
] as const satisfies readonly ZoneKey[];

/** Oxygen cost in ml/kg/min at velocity `v` in m/min. */
export const vo2 = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;

/** Fraction of VO2max sustainable for `t` minutes. */
export const pctMax = (t: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

/** VDOT for a race: `distM` metres covered in `sec` seconds. */
export function vdotFrom(distM: number, sec: number): number {
  const t = sec / 60;
  return vo2(distM / t) / pctMax(t);
}

/** Velocity in m/min at an oxygen cost of `x`. Inverts `vo2`. */
export function velAtVO2(x: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - x;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Predicted race time in seconds. Bisection, as in the original. */
export function predictSec(vdot: number, distM: number): number {
  let lo = distM / 9;
  let hi = distM / 1;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (vdotFrom(distM, m) > vdot) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Pace in seconds per km at a fraction `f` of VDOT `v`. */
export const paceAtFrac = (v: number, f: number) => 60000 / velAtVO2(f * v);

export type Zone = {
  name: string;
  /** Fraction of VDOT at the slow end. */
  lo: number;
  /** Fraction of VDOT at the fast end. */
  hi: number;
  use: string;
};

export const ZONES: Record<TrainingZone, Zone> = {
  E: {
    name: "Easy",
    lo: 0.6,
    hi: 0.72,
    use: "Most of your running. Conversational, never faster than the fast end.",
  },
  S: {
    name: "Steady",
    lo: 0.76,
    hi: 0.82,
    use: "Aerobic strength. Comfortably hard, full sentences still possible.",
  },
  SS: {
    name: "Sweet spot",
    lo: 0.83,
    hi: 0.86,
    use: "Long reps just under threshold. Hard but repeatable.",
  },
  T: {
    name: "Threshold",
    lo: 0.87,
    hi: 0.9,
    use: "Comfortably hard. About one hour of racing effort.",
  },
  I: {
    name: "Intervals (VO₂)",
    lo: 0.96,
    hi: 1.0,
    use: "3 to 5 minute reps, equal jog recovery. Hard and controlled.",
  },
  R: {
    name: "Reps and strides",
    lo: 1.04,
    hi: 1.1,
    use: "Short, fast, relaxed. Full recovery between reps.",
  },
};

export const RACES: Record<RaceKey, number> = {
  "5K": 5000,
  "10K": 10000,
  HM: 21097.5,
  M: 42195,
};

export const RACE_LABEL: Record<RaceKey, string> = {
  "5K": "5k pace",
  "10K": "10k pace",
  HM: "Half-marathon pace",
  M: "Marathon pace",
};

function isTrainingZone(key: TrainingZone | RaceKey): key is TrainingZone {
  return key in ZONES;
}

/** A pace window in seconds per km. `mid` is the race pace itself. */
export type PaceRange = { fast: number; slow: number; mid?: number };

/** Pace window for a zone, or race pace ± 2 s/km for a race distance. */
export function zoneRange(key: TrainingZone | RaceKey, vdot: number): PaceRange {
  if (isTrainingZone(key)) {
    const zone = ZONES[key];
    return { fast: paceAtFrac(vdot, zone.hi), slow: paceAtFrac(vdot, zone.lo) };
  }
  const pace = predictSec(vdot, RACES[key]) / (RACES[key] / 1000);
  return { fast: pace - 2, slow: pace + 2, mid: pace };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 'm:ss', or an en dash when there is no pace to show. */
export function fmtPace(seconds: number): string {
  if (!isFinite(seconds)) return "–";
  const s = Math.round(seconds);
  return Math.floor(s / 60) + ":" + pad(s % 60);
}

/** 'm:ss' under an hour, 'h:mm:ss' above it. */
export function fmtTime(seconds: number): string {
  if (!isFinite(seconds)) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? h + ":" + pad(m) + ":" + pad(r) : m + ":" + pad(r);
}

/** What to call a zone in the interface. */
export function zoneLabel(key: ZoneKey): string {
  return isTrainingZone(key) ? ZONES[key].name : RACE_LABEL[key];
}

/** '4:48–5:36 /km' for a zone at a given VDOT. */
export function paceRangeLabel(key: ZoneKey, vdot: number): string {
  const { fast, slow } = zoneRange(key, vdot);
  return `${fmtPace(fast)}–${fmtPace(slow)} /km`;
}
