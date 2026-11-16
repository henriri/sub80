import "server-only";
import { z } from "zod";
import type { ChangeSnapshot } from "@/lib/calendar/change-messages";
import { MAX_WEEK, MOVE_WARNING_CODES, WORKOUT_STATUSES } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

/**
 * The plan's change log. Every change the athlete makes is a row here and the
 * newest undoable one can be reversed, so this is what the "Recent changes"
 * list reads.
 *
 * Writes go through the SQL functions wrapped in
 * src/lib/data/planned-workouts.ts, never through an insert from here: the
 * event and the workout it describes have to land in one transaction.
 */

const COLUMNS = "id, kind, source, status, payload, reverts_event_id, created_at";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.");
const weekIndex = z.int().min(1).max(MAX_WEEK);
const daySlot = z.union([z.literal(0), z.literal(1)]);

/**
 * The columns a change touched, as `undo_plan_event` reads them back.
 *
 * Every field is optional and unknown keys are stripped: an event records only
 * the columns its own change wrote, and an older event written before a key
 * existed still reads. A nullable field is a real value -- a cleared note is
 * `"notes": null`, which is not the same as a change that never touched notes.
 */
const snapshotSchema = z.object({
  planned_date: ymd.optional(),
  week_index: weekIndex.optional(),
  day_slot: daySlot.optional(),
  status: z.enum(WORKOUT_STATUSES).optional(),
  notes: z.string().nullable().optional(),
  target_distance_m: z.int().positive().nullable().optional(),
  original_distance_m: z.int().positive().nullable().optional(),
});

/**
 * The two days a move names, which "Recent changes" reads straight out of the
 * payload's flat keys. Kept alongside the snapshots rather than derived from
 * them because that is what the move function has always written.
 */
const movePayloadSchema = z.object({
  workout_id: z.uuid(),
  from: ymd,
  from_week: weekIndex,
  from_slot: daySlot,
  to: ymd,
  to_week: weekIndex,
  to_slot: daySlot,
  overrides: z.array(z.enum(MOVE_WARNING_CODES)).default([]),
});

/** Only these kinds carry the flat move keys. */
const MOVE_KINDS = ["move_workout", "undo_move"] as const;

const planEventSchema = z.object({
  id: z.uuid(),
  kind: z.string().min(1),
  source: z.enum(["user", "coach", "system"]),
  status: z.enum(["proposed", "accepted", "rejected", "undone"]),
  payload: z.unknown(),
  reverts_event_id: z.uuid().nullable(),
  created_at: z.string(),
});

export type PlanEvent = z.infer<typeof planEventSchema> & {
  /** The parsed flat move keys, or null for a kind that does not carry them. */
  move: z.infer<typeof movePayloadSchema> | null;
  /** What the change replaced, which is what undoing it writes back. */
  before: ChangeSnapshot | null;
  /** What the change wrote, which undo verifies is still there. */
  after: ChangeSnapshot | null;
  /** For an undo, the kind of change it reversed. */
  undoneKind: string | null;
};

const planEventsSchema = z.array(planEventSchema);

const snapshot = (payload: unknown, key: "before" | "after"): ChangeSnapshot | null => {
  if (typeof payload !== "object" || payload === null) return null;
  const parsed = snapshotSchema.safeParse(
    (payload as Record<string, unknown>)[key],
  );
  return parsed.success ? parsed.data : null;
};

const undoneKind = (payload: unknown): string | null => {
  if (typeof payload !== "object" || payload === null) return null;
  const parsed = z
    .string()
    .min(1)
    .safeParse((payload as Record<string, unknown>).undone_kind);
  return parsed.success ? parsed.data : null;
};

function withDetail(event: z.infer<typeof planEventSchema>): PlanEvent {
  const isMove = (MOVE_KINDS as readonly string[]).includes(event.kind);
  const move = isMove ? movePayloadSchema.safeParse(event.payload) : null;

  return {
    ...event,
    move: move?.success ? move.data : null,
    before: snapshot(event.payload, "before"),
    after: snapshot(event.payload, "after"),
    undoneKind: undoneKind(event.payload),
  };
}

/**
 * The newest events first. Undo is a stack, so only one row of this list may
 * actually be undone: `undoableIndex` in
 * src/lib/calendar/change-messages.ts says which, by the same rule
 * `undo_plan_event` applies.
 */
export async function readRecentPlanEvents(
  userId: string,
  limit: number,
): Promise<PlanEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_events")
    .select(COLUMNS)
    .eq("user_id", userId)
    // seq, not created_at: created_at is now() and identical for two events
    // written in one transaction, so it cannot order them.
    .order("seq", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not read the plan history: ${error.message}`);
  // Rows cross a boundary, so they are validated rather than trusted.
  return planEventsSchema.parse(data).map(withDetail);
}
