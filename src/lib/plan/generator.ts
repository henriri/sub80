/**
 * The 78-week plan generator, ported unchanged from the first app so the
 * generated plan comes out identical. Pure, no framework imports. The golden
 * fixture in __fixtures__/plan-golden.json is the legacy output and the test
 * asserts every week deep-equals it.
 *
 * Shape of a week: a phase sets the peak volume, the position in the 4-week
 * cycle scales it (3 up, 1 down) and the quality sessions come from per-phase
 * tables. `allot` then splits the weekly volume over the sessions.
 */

import { MAX_WEEK, weekStart, type Ymd } from "./dates";
import type { Phase, PhaseId, Session, Week, WorkoutKind } from "./types";
import type { ZoneKey } from "./vdot";

/** Array access that fails loudly instead of returning undefined. */
function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`No plan entry at index ${index}`);
  return value;
}

/** A quality session as [title, kind, pace zone]. */
type Quality = readonly [title: string, kind: WorkoutKind, key: ZoneKey];
/** A long run as [title, pace zone]; the kind is always 'long'. */
type Long = readonly [title: string, key: ZoneKey];

export const phases: readonly Phase[] = [
  {
    id: "P0",
    name: "Re-entry",
    from: 1,
    to: 12,
    goal: "Easy running only. Rebuild routine, tendons and adductors. Strides from week 3.",
  },
  {
    id: "P1",
    name: "Aerobic base",
    from: 13,
    to: 24,
    goal: "Volume and light steady running. Hill sprints for strength.",
  },
  {
    id: "P2",
    name: "Threshold build",
    from: 25,
    to: 36,
    goal: "Sweet spot, then threshold. Short VO₂ work. Ends with a 5k time trial.",
  },
  {
    id: "P3",
    name: "Summer base",
    from: 37,
    to: 44,
    goal: "Aerobic volume, tempo runs, long runs up to 22 km.",
  },
  {
    id: "P4",
    name: "5k / 10k block",
    from: 45,
    to: 58,
    goal: "Threshold plus 5k and 10k pace work. 5k race in week 52, 10k race in week 58.",
  },
  {
    id: "P5",
    name: "Winter base",
    from: 59,
    to: 66,
    goal: "Easy volume, bike and aqua-jog for extra hours, one tempo a week.",
  },
  {
    id: "P6",
    name: "Half-specific",
    from: 67,
    to: 78,
    goal: "Threshold, long runs with half-marathon pace blocks, taper, race.",
  },
];

/** Weekly km for the re-entry phase, week by week. */
const P0KM = [22, 26, 30, 22, 28, 32, 36, 26, 34, 38, 42, 30];

/** Peak weekly km per 4-week cycle, by phase. */
const PEAKS: Record<Exclude<PhaseId, "P0">, readonly number[]> = {
  P1: [46, 50, 55],
  P2: [55, 57, 58],
  P3: [58, 60],
  P4: [58, 60, 60, 60],
  P5: [58, 60],
  P6: [58, 60, 60],
};

/**
 * Share of the cycle peak by position in the 4-week cycle: three weeks up,
 * one down.
 */
const CYCLE = [0.9, 0.95, 1, 0.7];

const Q = (titles: readonly string[], kind: WorkoutKind, key: ZoneKey): Quality[] =>
  titles.map((title) => [title, kind, key]);

const P1_THU: readonly (readonly Quality[])[] = [
  [
    ["Easy + 6 × 10 s hill sprints", "hills", "E"],
    ["Easy + 8 × 10 s hill sprints", "hills", "E"],
    ["Easy + 8 × 12 s hill sprints", "hills", "E"],
    ["Easy + 6 strides", "easy", "E"],
  ],
  [
    ...Q(
      [
        "Steady 2 × 12′ (3′ easy between)",
        "Steady 2 × 15′ (3′ easy between)",
        "Steady 20′ continuous",
      ],
      "steady",
      "S",
    ),
    ["Easy + 6 strides", "easy", "E"],
  ],
  [
    ...Q(
      ["Steady 25′ + 4 strides", "Steady 30′ continuous", "Steady 2 × 20′ (3′ easy between)"],
      "steady",
      "S",
    ),
    ["Easy + 6 strides", "easy", "E"],
  ],
];

const P2_QA: readonly (readonly Quality[])[] = [
  Q(
    [
      "Sweet spot 3 × 10′ (2′ jog)",
      "Sweet spot 3 × 12′ (2′ jog)",
      "Sweet spot 2 × 20′ (3′ jog)",
      "Sweet spot 2 × 10′ (down week)",
    ],
    "sweet",
    "SS",
  ),
  Q(
    [
      "Threshold 4 × 6′ (90″ jog)",
      "Threshold 3 × 10′ (2′ jog)",
      "Threshold 2 × 15′ (3′ jog)",
      "Threshold 3 × 6′ (down week)",
    ],
    "threshold",
    "T",
  ),
  [
    ...Q(
      ["Threshold 4 × 8′ (90″ jog)", "Threshold 3 × 12′ (2′ jog)", "Threshold 2 × 18′ (3′ jog)"],
      "threshold",
      "T",
    ),
    ["5k time trial (15′ warm-up, even pacing, 10′ cool-down)", "tt", "5K"],
  ],
];

const P2_QB: readonly (readonly Quality[])[] = [
  [
    ["Easy + 8 × 200 m strides", "easy", "E"],
    ["8 × 400 m @ I (200 m jog)", "interval", "I"],
    ["10 × 400 m @ I (200 m jog)", "interval", "I"],
    ["Easy + 6 strides", "easy", "E"],
  ],
  [
    ["Easy + 6 strides", "easy", "E"],
    ["6 × 600 m @ I (2′ jog)", "interval", "I"],
    ["5 × 800 m @ I (2′ jog)", "interval", "I"],
    ["Easy + 6 strides", "easy", "E"],
  ],
  [
    ["5 × 1 km @ I (2′ jog)", "interval", "I"],
    ["6 × 800 m @ I (2′ jog)", "interval", "I"],
    ["Easy + 6 strides", "easy", "E"],
    ["Easy + 6 strides", "easy", "E"],
  ],
];

const P3_QA: readonly (readonly Quality[])[] = [
  [
    ["Tempo 25′ continuous", "threshold", "T"],
    ["Sweet spot 2 × 15′ (3′ jog)", "sweet", "SS"],
    ["Tempo 30′ continuous", "threshold", "T"],
    ["Tempo 20′ (down week)", "threshold", "T"],
  ],
  [
    ["Tempo 30′ continuous", "threshold", "T"],
    ["Threshold 3 × 12′ (2′ jog)", "threshold", "T"],
    ["Tempo 35′ continuous", "threshold", "T"],
    ["Threshold 2 × 10′ (down week)", "threshold", "T"],
  ],
];

const P3_QB: readonly (readonly Quality[])[] = [
  [
    ["Easy + 6 × 30 s hills", "hills", "E"],
    ["Easy + 6 strides", "easy", "E"],
    ["Easy + 8 × 30 s hills", "hills", "E"],
    ["Easy + 6 strides", "easy", "E"],
  ],
  [
    ["Fartlek 8 × 1′ hard / 1′ easy", "interval", "I"],
    ["Easy + 6 strides", "easy", "E"],
    ["Fartlek 10 × 1′ hard / 1′ easy", "interval", "I"],
    ["Easy + 6 strides", "easy", "E"],
  ],
];

const P3_LONG: readonly (readonly Long[])[] = [
  [
    ["Long easy run", "E"],
    ["Long easy run", "E"],
    ["Long run, last 3 km steady", "S"],
    ["Long easy run", "E"],
  ],
  [
    ["Long run, last 4 km steady", "S"],
    ["Long run, last 5 km steady", "S"],
    ["Long run, last 6 km steady", "S"],
    ["Long easy run", "E"],
  ],
];

const P4_QA: readonly (readonly Quality[])[] = [
  Q(
    [
      "Threshold 5 × 1 km (60″ jog)",
      "Threshold 4 × 1.5 km (75″ jog)",
      "Threshold 3 × 2 km (90″ jog)",
      "Threshold 3 × 1 km (down week)",
    ],
    "threshold",
    "T",
  ),
  Q(
    ["Threshold 6 × 1 km (60″ jog)", "Threshold 2 × 15′ (3′ jog)", "Threshold 3 × 8′ (sharpening)"],
    "threshold",
    "T",
  ),
  Q(
    [
      "Threshold 5 × 1.5 km (75″ jog)",
      "Threshold 2 × 20′ (3′ jog)",
      "Threshold 6 × 1 km (60″ jog)",
      "Threshold 3 × 6′ (down week)",
    ],
    "threshold",
    "T",
  ),
  Q(["Sharpen: 3 × 1 km @ T + 4 × 200 m @ R"], "threshold", "T"),
];

const P4_QB: readonly (readonly Quality[])[] = [
  [
    ["8 × 400 m @ I (200 m jog)", "interval", "I"],
    ["6 × 800 m @ 5k pace (2′ jog)", "interval", "5K"],
    ["5 × 1 km @ 5k pace (2′ jog)", "interval", "5K"],
    ["Easy + 6 strides", "easy", "E"],
  ],
  [
    ["6 × 1 km @ 5k pace (2′ jog)", "interval", "5K"],
    ["5 × 1200 m @ 5k pace (2′30″ jog)", "interval", "5K"],
    ["8 × 400 m @ 5k pace (sharpening)", "interval", "5K"],
    ["Easy + 6 strides", "easy", "E"],
  ],
  [
    ["6 × 1 km @ 10k pace (90″ jog)", "interval", "10K"],
    ["4 × 1.5 km @ 10k pace (2′ jog)", "interval", "10K"],
    ["3 × 2 km @ 10k pace (2′30″ jog)", "interval", "10K"],
    ["Easy + 6 strides", "easy", "E"],
  ],
  [["5 × 1 km @ 10k pace (90″ jog)", "interval", "10K"]],
];

const P5_QA: readonly (readonly Quality[])[] = [
  [
    ["Tempo 25′ continuous", "threshold", "T"],
    ["Threshold 3 × 10′ (2′ jog)", "threshold", "T"],
    ["Tempo 30′ continuous", "threshold", "T"],
    ["Threshold 2 × 8′ (down week)", "threshold", "T"],
  ],
  [
    ["Threshold 3 × 12′ (2′ jog)", "threshold", "T"],
    ["Tempo 35′ continuous", "threshold", "T"],
    ["Threshold 2 × 20′ (3′ jog)", "threshold", "T"],
    ["Easy + 4 strides (tune-up week)", "easy", "E"],
  ],
];

const P5_QB: readonly (readonly Quality[])[] = [
  [
    ["Easy + 6 strides", "easy", "E"],
    ["Easy + 8 × 30 s hills", "hills", "E"],
    ["Easy + 6 strides", "easy", "E"],
    ["Easy + 6 strides", "easy", "E"],
  ],
  [
    ["Easy + 6 strides", "easy", "E"],
    ["6 × 600 m @ I (2′ jog)", "interval", "I"],
    ["Easy + 6 strides", "easy", "E"],
    ["Easy + 6 strides", "easy", "E"],
  ],
];

const P5_LONG: readonly (readonly Long[])[] = [
  [
    ["Long easy run", "E"],
    ["Long run, last 20′ steady", "S"],
    ["Long run, last 25′ steady", "S"],
    ["Long easy run", "E"],
  ],
  [
    ["Long run, last 30′ steady", "S"],
    ["Long run, last 30′ steady", "S"],
    ["Long run, last 35′ steady", "S"],
    ["Optional tune-up race", "10K"],
  ],
];

const P6_QA: readonly (readonly Quality[])[] = [
  [
    ["Threshold 3 × 12′ (2′ jog)", "threshold", "T"],
    ["Threshold 2 × 20′ (3′ jog)", "threshold", "T"],
    ["Threshold 4 × 10′ (90″ jog)", "threshold", "T"],
    ["Threshold 3 × 8′ (down week)", "threshold", "T"],
  ],
  [
    ["Threshold 4 × 10′ (90″ jog)", "threshold", "T"],
    ["Threshold 3 × 15′ (2′ jog)", "threshold", "T"],
    ["Tempo 6 km continuous", "threshold", "T"],
    ["Threshold 3 × 8′ (down week)", "threshold", "T"],
  ],
  [
    ["Threshold 2 × 20′ (3′ jog)", "threshold", "T"],
    ["2 × 5 km @ half-marathon pace (2′ jog)", "threshold", "HM"],
    ["Taper: threshold 3 × 8′", "threshold", "T"],
    ["Race week", "easy", "E"],
  ],
];

const P6_QB: readonly (readonly Quality[])[] = [
  [
    ["Easy + 6 strides", "easy", "E"],
    ["5 × 1 km @ I (2′ jog)", "interval", "I"],
    ["Easy + 6 strides", "easy", "E"],
    ["Easy + 6 strides", "easy", "E"],
  ],
  [
    ["3 × 3 km @ half-marathon pace (90″ jog)", "threshold", "HM"],
    ["Easy + 6 strides", "easy", "E"],
    ["6 × 800 m @ I (2′ jog)", "interval", "I"],
    ["Easy + 6 strides", "easy", "E"],
  ],
  [
    ["Easy + 6 strides", "easy", "E"],
    ["Easy + 6 strides", "easy", "E"],
    ["Openers: 4 × 1 km @ half-marathon pace", "threshold", "HM"],
    ["Race week", "easy", "E"],
  ],
];

const P6_LONG: readonly (readonly Long[])[] = [
  [
    ["Long easy run", "E"],
    ["Long run with 6 km @ half-marathon pace", "HM"],
    ["Long run with 8 km @ half-marathon pace", "HM"],
    ["Long easy run", "E"],
  ],
  [
    ["Long run with 10 km @ half-marathon pace", "HM"],
    ["Long run with 12 km @ half-marathon pace", "HM"],
    ["Long run: 2 × 6 km @ half-marathon pace", "HM"],
    ["Long easy run", "E"],
  ],
  [
    ["Long run with 10 km @ half-marathon pace", "HM"],
    ["Long run with 8 km @ half-marathon pace (last big one)", "HM"],
    ["Taper long run, easy", "E"],
    ["Race", "HM"],
  ],
];

type EventWeek = {
  key: ZoneKey;
  /** Race distance in km. */
  dist: number;
  title: string;
  openers: string;
  /** Fixed km for Tuesday, Thursday and Saturday. */
  tue: number;
  thu: number;
  sat: number;
};

const EVENT_WEEKS: Record<number, EventWeek> = {
  52: {
    key: "5K",
    dist: 5,
    title: "RACE: 5k",
    openers: "4 × 400 m @ 5k pace",
    tue: 8,
    thu: 8,
    sat: 5,
  },
  58: {
    key: "10K",
    dist: 10,
    title: "RACE: 10k",
    openers: "4 × 400 m @ 10k pace",
    tue: 8,
    thu: 8,
    sat: 5,
  },
  78: {
    key: "HM",
    dist: 21.1,
    title: "RACE: half marathon, target sub-1:20",
    openers: "4 × 1 km @ half-marathon pace",
    tue: 8,
    thu: 8,
    sat: 5,
  },
};

export function phaseOf(week: number): Phase {
  const phase = phases.find((p) => week >= p.from && week <= p.to);
  if (!phase) throw new RangeError(`Week ${week} is outside the plan`);
  return phase;
}

const roundHalf = (x: number) => Math.round(x * 2) / 2;

/** A session while the weekly volume is being split; becomes a `Session`. */
type Item = {
  dow: number;
  /** Share of the free weekly volume. Ignored when `fixedKm` is set. */
  share: number;
  kind: WorkoutKind;
  title: string;
  key: ZoneKey | null;
  km: number;
  fixedKm?: number;
  strides?: boolean;
};

function item(
  dow: number,
  share: number,
  kind: WorkoutKind,
  title: string,
  key: ZoneKey | null,
  extra: { fixedKm?: number; strides?: boolean } = {},
): Item {
  return { dow, share, kind, title, key, km: 0, ...extra };
}

const quality = (dow: number, share: number, q: Quality): Item =>
  item(dow, share, q[1], q[0], q[2]);

const longRun = (dow: number, share: number, lg: Long): Item =>
  item(dow, share, "long", lg[0], lg[1]);

function byDow(items: readonly Item[], dow: number): Item {
  const found = items.find((x) => x.dow === dow);
  if (!found) throw new RangeError(`No session on dow ${dow}`);
  return found;
}

/**
 * Splits `total` km over the sessions: fixed distances first, the rest by
 * share rounded to the half km, then the remainder onto the biggest free
 * session so the week adds up. Ported expression for expression, because the
 * rounding order is what makes a 7.5 km run stay 7.5 km.
 */
function allot(total: number, items: Item[]): void {
  const fixed = items.reduce((a, x) => a + (x.fixedKm ?? 0), 0);
  const rest = Math.max(0, total - fixed);
  const ss = items.filter((x) => x.fixedKm === undefined).reduce((a, x) => a + x.share, 0) || 1;
  for (const x of items) {
    x.km = x.fixedKm !== undefined ? x.fixedKm : roundHalf((rest * x.share) / ss);
  }
  const free = items.filter((x) => x.fixedKm === undefined);
  if (free.length) {
    const diff = total - items.reduce((a, x) => a + x.km, 0);
    const big = free.reduce((a, x) => (x.share > a.share ? x : a), at(free, 0));
    big.km = Math.max(1, big.km + diff);
  }
}

export function buildWeek(i: number): Week {
  if (!Number.isInteger(i) || i < 1 || i > MAX_WEEK) {
    throw new RangeError(`Plan week must be 1 to ${MAX_WEEK}, got ${i}`);
  }

  const ph = phaseOf(i);
  const off = i - ph.from;
  const c = Math.floor(off / 4);
  const pos = off % 4;
  const down = pos === 3;

  let km: number;
  if (ph.id === "P0") {
    km = at(P0KM, i - 1);
  } else {
    const peaks = PEAKS[ph.id];
    const peak = at(peaks, Math.min(c, peaks.length - 1));
    km = Math.round(peak * at(CYCLE, pos));
  }
  if (i === 77) km = 48;

  const start: Ymd = weekStart(i);
  let items: Item[] = [];
  let label = down ? "Down week" : "Build week";
  const ev = EVENT_WEEKS[i];

  if (ev) {
    label = "Race week";
    items = [
      item(1, 0, "easy", "Easy run + 4 strides", "E", { fixedKm: ev.tue, strides: true }),
      item(3, 0, "interval", "Openers: " + ev.openers, ev.key, { fixedKm: ev.thu }),
      item(5, 0, "easy", "Shakeout + 4 strides", "E", { fixedKm: ev.sat, strides: true }),
      item(6, 0, "race", ev.title, ev.key, { fixedKm: ev.dist + 4 }),
    ];
  } else if (ph.id === "P0") {
    const four = i >= 5;
    const st = i >= 3;
    if (!four) {
      items = [
        item(1, 0.3, "easy", "Easy run", "E"),
        item(3, 0.28, "easy", "Easy run" + (st ? " + 4 strides" : ""), "E", { strides: st }),
        item(6, 0.42, "long", "Long easy run", "E"),
      ];
    } else {
      items = [
        item(1, 0.22, "easy", "Easy run", "E"),
        item(3, 0.22, "easy", "Easy run + 4 strides", "E", { strides: true }),
        item(5, 0.2, "easy", "Easy run", "E"),
        item(6, 0.36, "long", "Long easy run", "E"),
      ];
    }
    if (i === 8) {
      items = items.filter((x) => x.dow !== 3);
      items.push(
        item(3, 0, "tt", "30′ time trial (2 km warm-up, steady hard effort, 1 km cool-down)", "T", {
          fixedKm: 9,
        }),
      );
    }
  } else if (ph.id === "P1") {
    const q = at(at(P1_THU, c), pos);
    const longT: Long =
      c === 2 && (pos === 1 || pos === 2)
        ? ["Long run, last 10′ steady", "S"]
        : ["Long easy run", "E"];
    items = down
      ? [
          item(1, 0.2, "easy", "Easy run", "E"),
          quality(3, 0.24, q),
          item(5, 0.2, "easy", "Easy run + 6 strides", "E", { strides: true }),
          longRun(6, 0.36, longT),
        ]
      : [
          item(1, 0.17, "easy", "Easy run", "E"),
          quality(3, 0.2, q),
          item(4, 0.14, "easy", "Easy run", "E"),
          item(5, 0.17, "easy", "Easy run + 6 strides", "E", { strides: true }),
          longRun(6, 0.32, longT),
        ];
  } else {
    let qa: Quality;
    let qb: Quality;
    let lg: Long;
    if (ph.id === "P2") {
      qa = at(at(P2_QA, c), pos);
      qb = at(at(P2_QB, c), pos);
      lg = ["Long easy run", "E"];
      if (c >= 1 && (pos === 1 || pos === 2)) lg = ["Long run, last 15′ steady", "S"];
    } else if (ph.id === "P3") {
      qa = at(at(P3_QA, c), pos);
      qb = at(at(P3_QB, c), pos);
      lg = at(at(P3_LONG, c), pos);
    } else if (ph.id === "P4") {
      qa = at(at(P4_QA, c), pos);
      qb = at(at(P4_QB, c), pos);
      lg =
        (pos === 1 || pos === 2) && c !== 1
          ? ["Long run, last 4 km steady", "S"]
          : ["Long easy run", "E"];
      if (c === 3) lg = ["Long easy run", "E"];
    } else if (ph.id === "P5") {
      qa = at(at(P5_QA, c), pos);
      qb = at(at(P5_QB, c), pos);
      lg = at(at(P5_LONG, c), pos);
    } else {
      qa = at(at(P6_QA, c), pos);
      qb = at(at(P6_QB, c), pos);
      lg = at(at(P6_LONG, c), pos);
    }

    items = down
      ? [
          quality(1, 0.22, qa),
          quality(3, 0.2, qb),
          item(5, 0.2, "easy", "Easy run + 6 strides", "E", { strides: true }),
          longRun(6, 0.38, lg),
        ]
      : [
          quality(1, 0.2, qa),
          quality(3, 0.17, qb),
          item(4, 0.12, "easy", "Easy run", "E"),
          item(5, 0.14, "easy", "Easy run + 6 strides", "E", { strides: true }),
          longRun(6, ph.id === "P2" ? 0.36 : 0.37, lg),
        ];

    if (i === 36) {
      const tuesday = byDow(items, 1);
      tuesday.fixedKm = 10;
      tuesday.kind = "tt";
    }
    if (i === 66) {
      const sunday = byDow(items, 6);
      sunday.title = "Optional tune-up race: 10k or 15k";
      sunday.kind = "race";
      sunday.key = "10K";
      sunday.fixedKm = 14;
      label = "Down week + tune-up";
    }
    if (i === 77) label = "Taper week";
  }

  allot(km, items);
  items.sort((a, b) => a.dow - b.dow);

  const sessions: Session[] = items.map((x) => ({
    id: `w${i}-d${x.dow}`,
    dow: x.dow,
    kind: x.kind,
    title: x.title,
    key: x.key,
    km: x.km,
    strides: !!x.strides,
  }));
  const total = Math.round(sessions.reduce((a, s) => a + s.km, 0));

  return { i, start, phase: ph, label, down, km: total, sessions };
}

/**
 * Plan week `i`. The legacy code memoised this; `buildWeek` only touches
 * objects it has just created, so it is deterministic without a cache and
 * every caller gets its own copy.
 */
export function plan(i: number): Week {
  return buildWeek(i);
}

/** All 78 weeks, in order. */
export function allWeeks(): Week[] {
  return Array.from({ length: MAX_WEEK }, (_, k) => buildWeek(k + 1));
}
