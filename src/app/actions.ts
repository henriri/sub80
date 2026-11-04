"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { countPlannedWorkouts, insertPlannedWorkouts } from "@/lib/data/planned-workouts";
import { PLAN_SESSION_COUNT, allWeeks, insertRowsSchema, toPlannedRows } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type GeneratePlanState = { error?: string };

const ALREADY_PLANNED = "You already have a plan. Nothing was changed.";

/**
 * Seeds the 78-week plan for the signed-in user, once. Runs as the user, so
 * row-level security applies; refuses if any planned workout already exists,
 * and the unique index catches the race between two submits.
 */
export async function generatePlan(
  _previous: GeneratePlanState,
  formData: FormData,
): Promise<GeneratePlanState> {
  // The submit button carries the intent, as on the login form: a post without
  // it is not a request to generate the plan.
  if (formData.get("intent") !== "generate") return {};

  const user = await requireUser();

  try {
    if ((await countPlannedWorkouts(user.id)) > 0) return { error: ALREADY_PLANNED };

    const parsed = insertRowsSchema.safeParse(toPlannedRows(allWeeks(), user.id));
    if (!parsed.success || parsed.data.length !== PLAN_SESSION_COUNT) {
      return { error: "The generated plan did not pass validation. Nothing was saved." };
    }

    const outcome = await insertPlannedWorkouts(parsed.data);
    if (!outcome.ok) return { error: ALREADY_PLANNED };
  } catch {
    return { error: "Could not save the plan. Try again." };
  }

  revalidatePath("/");
  return {};
}
