import { describe, expect, it } from "vitest";
import { addDays, weekStart } from "./dates";
import {
  LIGHTEN_FRACTIONS,
  validateLighten,
  validateRestore,
} from "./lighten";
import { validateMove, type MoveCandidate } from "./moves";
import {
  canMoveSession,
  sessionActions,
  type LinkedRun,
  type SessionActions,
  type SessionCandidate,
} from "./session-actions";
import { WORKOUT_STATUSES, type WorkoutStatus } from "./types";

let nextId = 1;

const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;

/** Plan week 22: Monday 2027-03-15 to Sunday 2027-03-21, far from any DST change. */
const MONDAY = weekStart(22);
const TODAY = addDays(MONDAY, 3);
const FUTURE = addDays(MONDAY, 5);
const PAST = addDays(MONDAY, 1);

function session(overrides: Partial<SessionCandidate> = {}): SessionCandidate {
  return {
    id: uuid(),
    status: "planned",
    planned_date: FUTURE,
    target_distance_m: 14_000,
    original_distance_m: null,
    ...overrides,
  };
}

const run = (): LinkedRun => ({ id: uuid() });

/** The whole answer in one object, so a case cannot assert half of it. */
const offered = (overrides: Partial<SessionActions> = {}): SessionActions => ({
  done: false,
  canLogRun: false,
  canMove: false,
  canLighten: false,
  canRestore: false,
  canSkip: false,
  canBackToPlanned: false,
  ...overrides,
});

/** Nothing at all: what a session with a run against it offers. */
const CLOSED = offered({ done: true });

describe("sessionActions", () => {
  describe("a session with a run linked to it", () => {
    const days = [
      ["in the future", FUTURE],
      ["today", TODAY],
      ["in the past", PAST],
    ] as const;

    for (const status of WORKOUT_STATUSES) {
      for (const [when, date] of days) {
        it(`offers nothing but its summary: ${status}, ${when}, one run`, () => {
          expect(
            sessionActions(session({ status, planned_date: date }), [run()], TODAY),
          ).toEqual(CLOSED);
        });
      }
    }

    it("is done on several runs too, which is a legitimate day", () => {
      expect(
        sessionActions(session({ planned_date: PAST }), [run(), run()], TODAY),
      ).toEqual(CLOSED);
    });

    it("is done however the stored status reads, because the run is the fact", () => {
      for (const status of WORKOUT_STATUSES) {
        expect(
          sessionActions(session({ status, planned_date: PAST }), [run()], TODAY).done,
        ).toBe(true);
      }
    });
  });

  describe("a planned session with no run", () => {
    it("in the future, offers moving, a lighter day and skipping", () => {
      expect(sessionActions(session({ planned_date: FUTURE }), [], TODAY)).toEqual(
        offered({ canMove: true, canLighten: true, canSkip: true }),
      );
    });

    it("today, offers logging the run and skipping, and nothing to rearrange", () => {
      expect(sessionActions(session({ planned_date: TODAY }), [], TODAY)).toEqual(
        offered({ canLogRun: true, canSkip: true }),
      );
    });

    it("in the past, offers logging the run and skipping", () => {
      expect(sessionActions(session({ planned_date: PAST }), [], TODAY)).toEqual(
        offered({ canLogRun: true, canSkip: true }),
      );
    });

    it("in the future and lightened once, offers the other reduction and the distance back", () => {
      // 14 km at -20% is 11 km. -40% of the plan is 8.5 km, which is still
      // lighter than that, so one fraction is left on offer.
      expect(
        sessionActions(
          session({
            planned_date: FUTURE,
            target_distance_m: 11_000,
            original_distance_m: 14_000,
          }),
          [],
          TODAY,
        ),
      ).toEqual(
        offered({
          canMove: true,
          canLighten: true,
          canRestore: true,
          canSkip: true,
        }),
      );
    });

    it("as light as it goes, offers the distance back and no further reduction", () => {
      // 8.5 km is 14 km at -40%. Asking for -20% now would put distance BACK,
      // and the only path allowed to do that is restore, which checks the
      // 60 km ceiling.
      expect(
        sessionActions(
          session({
            planned_date: FUTURE,
            target_distance_m: 8_500,
            original_distance_m: 14_000,
          }),
          [],
          TODAY,
        ),
      ).toEqual(offered({ canMove: true, canRestore: true, canSkip: true }));
    });

    it("offers no restore on a day the plan's own distance is still on", () => {
      expect(
        sessionActions(session({ planned_date: FUTURE }), [], TODAY).canRestore,
      ).toBe(false);
    });

    it("offers no restore once the day has come, lightened or not", () => {
      for (const planned_date of [TODAY, PAST]) {
        expect(
          sessionActions(
            session({
              planned_date,
              target_distance_m: 8_500,
              original_distance_m: 14_000,
            }),
            [],
            TODAY,
          ).canRestore,
        ).toBe(false);
      }
    });

    it("withholds a lighter day when there is no distance to take off", () => {
      const actions = sessionActions(
        session({ planned_date: FUTURE, target_distance_m: null }),
        [],
        TODAY,
      );
      expect(actions.canLighten).toBe(false);
      // The session is still movable and still skippable: only the lighter day
      // depends on there being a distance.
      expect(actions.canMove).toBe(true);
      expect(actions.canSkip).toBe(true);
    });
  });

  describe("a skipped session with no run", () => {
    it("today, offers logging the run and putting it back to planned", () => {
      expect(
        sessionActions(session({ status: "skipped", planned_date: TODAY }), [], TODAY),
      ).toEqual(offered({ canLogRun: true, canBackToPlanned: true }));
    });

    it("in the past, offers the same two", () => {
      expect(
        sessionActions(session({ status: "skipped", planned_date: PAST }), [], TODAY),
      ).toEqual(offered({ canLogRun: true, canBackToPlanned: true }));
    });

    it("in the future, offers only putting it back: there is nothing to log yet", () => {
      expect(
        sessionActions(session({ status: "skipped", planned_date: FUTURE }), [], TODAY),
      ).toEqual(offered({ canBackToPlanned: true }));
    });

    it("never offers skipping what is already skipped", () => {
      for (const date of [FUTURE, TODAY, PAST]) {
        expect(
          sessionActions(session({ status: "skipped", planned_date: date }), [], TODAY)
            .canSkip,
        ).toBe(false);
      }
    });
  });

  /*
   * The row the rule says cannot exist, and which old test data does. It is
   * read as a session still waiting for its run rather than as a finished one,
   * so there is a way out of the state in the interface.
   */
  describe("a completed session with no run", () => {
    it("today, offers logging the run and putting it back to planned", () => {
      expect(
        sessionActions(session({ status: "completed", planned_date: TODAY }), [], TODAY),
      ).toEqual(offered({ canLogRun: true, canBackToPlanned: true }));
    });

    it("in the past, offers the same two", () => {
      expect(
        sessionActions(session({ status: "completed", planned_date: PAST }), [], TODAY),
      ).toEqual(offered({ canLogRun: true, canBackToPlanned: true }));
    });

    it("in the future, offers only putting it back", () => {
      expect(
        sessionActions(
          session({ status: "completed", planned_date: FUTURE }),
          [],
          TODAY,
        ),
      ).toEqual(offered({ canBackToPlanned: true }));
    });

    it("is never reported done, because done means a run", () => {
      expect(
        sessionActions(session({ status: "completed", planned_date: PAST }), [], TODAY)
          .done,
      ).toBe(false);
    });
  });

  describe("every combination is answered", () => {
    const dates = [FUTURE, TODAY, PAST];

    it("covers date x status x runs without a gap", () => {
      for (const planned_date of dates) {
        for (const status of WORKOUT_STATUSES) {
          for (const runs of [[], [run()]]) {
            const actions = sessionActions(
              session({ status, planned_date }),
              runs,
              TODAY,
            );
            // Exactly one reading of done, and a run always closes the session.
            expect(actions.done).toBe(runs.length > 0);
            if (runs.length > 0) expect(actions).toEqual(CLOSED);
          }
        }
      }
    });

    it("never offers logging a run and moving the same session", () => {
      for (const planned_date of dates) {
        for (const status of WORKOUT_STATUSES) {
          const actions = sessionActions(session({ status, planned_date }), [], TODAY);
          expect(actions.canLogRun && actions.canMove).toBe(false);
          // Skipping and putting back are the two halves of one decision.
          expect(actions.canSkip && actions.canBackToPlanned).toBe(false);
        }
      }
    });
  });

  /*
   * One direction only, deliberately. Nothing this function offers may be
   * refused by the rules the Server Actions re-run; the reverse is not claimed,
   * because a session dated today is movable as far as validateMove is
   * concerned and is still not offered a move here.
   */
  describe("agreement with the server rules", () => {
    const moveCandidate = (candidate: SessionCandidate): MoveCandidate => ({
      id: candidate.id,
      planned_date: candidate.planned_date,
      target_distance_m: candidate.target_distance_m,
      is_key: false,
      status: candidate.status,
      day_slot: 0,
      title: "Easy",
    });

    it("offers a move only where validateMove accepts the session itself", () => {
      for (const planned_date of [FUTURE, TODAY, PAST]) {
        for (const status of WORKOUT_STATUSES) {
          const candidate = session({ status, planned_date });
          if (!sessionActions(candidate, [], TODAY).canMove) continue;

          const check = validateMove({
            workout: moveCandidate(candidate),
            // A free day inside the plan, later than both the session and today.
            toDate: addDays(MONDAY, 6),
            weekWorkouts: [],
            today: TODAY,
          });
          expect(check.ok, `${status} on ${planned_date}`).toBe(true);
        }
      }
    });

    it("offers a lighter day only where validateLighten accepts one", () => {
      const candidates = [FUTURE, TODAY, PAST].flatMap((planned_date) =>
        WORKOUT_STATUSES.flatMap((status) =>
          [14_000, null, 1_000].map((target_distance_m) =>
            session({ status, planned_date, target_distance_m }),
          ),
        ),
      );

      for (const candidate of candidates) {
        if (!sessionActions(candidate, [], TODAY).canLighten) continue;

        const some = LIGHTEN_FRACTIONS.some(
          (by) => validateLighten({ workout: candidate, by, today: TODAY }).ok,
        );
        expect(some, `${candidate.status} on ${candidate.planned_date}`).toBe(true);
      }
    });

    it("offers a restore only where validateRestore accepts the session", () => {
      for (const planned_date of [FUTURE, TODAY, PAST]) {
        for (const status of WORKOUT_STATUSES) {
          const candidate = session({
            status,
            planned_date,
            target_distance_m: 8_500,
            original_distance_m: 14_000,
          });
          if (!sessionActions(candidate, [], TODAY).canRestore) continue;

          // The week is empty here, so only the session's own gates can refuse.
          // The 60 km ceiling is the Server Action's to re-run with the week.
          const check = validateRestore({
            workout: candidate,
            weekWorkouts: [],
            today: TODAY,
          });
          expect(check.ok, `${status} on ${planned_date}`).toBe(true);
        }
      }
    });

    it("withholds a lighter day whenever no fraction is accepted", () => {
      const candidate = session({ planned_date: FUTURE, target_distance_m: 1_000 });
      expect(
        LIGHTEN_FRACTIONS.some(
          (by) => validateLighten({ workout: candidate, by, today: TODAY }).ok,
        ),
      ).toBe(false);
      expect(sessionActions(candidate, [], TODAY).canLighten).toBe(false);
    });
  });
});

/*
 * The drag layer's question, asked of a card that carries no distances. It has
 * to answer exactly as the whole function does, because a handle that appears
 * on a session the detail page says cannot move is a lie either way round.
 */
describe("canMoveSession", () => {
  it("answers exactly as sessionActions does, for every case", () => {
    for (const planned_date of [FUTURE, TODAY, PAST]) {
      for (const status of WORKOUT_STATUSES) {
        for (const runs of [[], [run()]]) {
          const candidate = session({ status, planned_date });
          expect(
            canMoveSession(candidate, runs, TODAY),
            `${status} on ${planned_date}, ${runs.length} runs`,
          ).toBe(sessionActions(candidate, runs, TODAY).canMove);
        }
      }
    }
  });

  it("needs only the status and the day, which is all a card has", () => {
    // No distances: the type is a Pick, so this compiles only while that holds.
    expect(canMoveSession({ status: "planned", planned_date: FUTURE }, [], TODAY)).toBe(
      true,
    );
    expect(canMoveSession({ status: "planned", planned_date: PAST }, [], TODAY)).toBe(
      false,
    );
  });

  it("refuses a session with a run against it, whatever its status says", () => {
    for (const status of WORKOUT_STATUSES) {
      expect(canMoveSession({ status, planned_date: FUTURE }, [run()], TODAY)).toBe(
        false,
      );
    }
  });
});

describe("WORKOUT_STATUSES", () => {
  it("is the set the matrix above is built from", () => {
    // A fourth status would silently go untested, so it is named here.
    expect([...WORKOUT_STATUSES]).toEqual<WorkoutStatus[]>([
      "planned",
      "completed",
      "skipped",
    ]);
  });
});
