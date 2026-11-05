import "server-only";
import { z } from "zod";
import { MAX_WEEK, MOVE_WARNING_CODES } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

/**
 * The plan's change log. Every move is a row here and the newest undoable one
 * can be reversed, so this is what the "Recent changes" list reads.
 *
 * Writes go through the move_planned_workout and undo_plan_event functions in
 * src/lib/data/planned-workouts.ts, never through an insert from here: the
 * event and the workout it describes have to land in one transaction.
 */

const COLUMNS = "id, kind, source, status, payload, reverts_event_id, created_at";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.");
const weekIndex = z.int().min(1).max(MAX_WEEK);

/**
 * The payload a move or an undo writes. Unknown keys are stripped rather than
 * rejected, so an older event written before a key existed still reads.
 */
const movePayloadSchema = z.object({
  workout_id: z.uuid(),
  from: ymd,
  from_week: weekIndex,
  from_slot: z.union([z.literal(0), z.literal(1)]),
  to: ymd,
  to_week: weekIndex,
  to_slot: z.union([z.literal(0), z.literal(1)]),
  overrides: z.array(z.enum(MOVE_WARNING_CODES)).default([]),
});

/** Only these two kinds carry a move payload; others are left opaque. */
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
  /** The parsed payload, or null for a kind that does not carry a move. */
  move: z.infer<typeof movePayloadSchema> | null;
};

const planEventsSchema = z.array(planEventSchema);

function withMove(event: z.infer<typeof planEventSchema>): PlanEvent {
  const isMove = (MOVE_KINDS as readonly string[]).includes(event.kind);
  const parsed = isMove ? movePayloadSchema.safeParse(event.payload) : null;

  return { ...event, move: parsed?.success ? parsed.data : null };
}

/**
 * Whether undo may be offered for an event. The same rule undo_plan_event
 * applies, so the interface never offers what the database will refuse.
 */
export function isUndoable(event: PlanEvent): boolean {
  return event.kind === "move_workout" && event.status !== "undone";
}

/**
 * The newest events first. Undo is a stack, so only the first undoable event
 * in this list may actually be undone -- see `isUndoable`.
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
  return planEventsSchema.parse(data).map(withMove);
}
