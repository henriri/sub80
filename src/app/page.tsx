import { Suspense } from "react";
import { Button } from "@/components/Button";
import { WorkoutList } from "@/components/WorkoutList";
import { requireUser } from "@/lib/auth/require-user";
import { countPlannedWorkouts, readNextWorkouts, readVdot } from "@/lib/data/planned-workouts";
import { parisDate } from "@/lib/plan";
import { signOut } from "./actions";
import { GeneratePlanForm } from "./generate-plan-form";

/** How far ahead the home page looks. No calendar yet. */
const DAYS_AHEAD = 14;

async function Account() {
  const user = await requireUser();

  return (
    <>
      <p className="text-secondary">Signed in as {user.email}</p>
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </>
  );
}

async function Plan() {
  const user = await requireUser();

  if ((await countPlannedWorkouts(user.id)) === 0) return <GeneratePlanForm />;

  const today = parisDate(new Date());
  const [vdot, workouts] = await Promise.all([
    readVdot(user.id),
    readNextWorkouts(user.id, today, DAYS_AHEAD),
  ]);

  return (
    <>
      <h2 className="text-heading-md">Next {DAYS_AHEAD} days</h2>
      {workouts.length === 0 ? (
        <p className="text-secondary">Nothing planned in the next {DAYS_AHEAD} days.</p>
      ) : (
        <WorkoutList items={workouts} vdot={vdot} />
      )}
    </>
  );
}

export default function Home() {
  return (
    <main className="flex flex-col gap-stack-md p-inset-lg">
      <h1 className="text-heading-lg">sub80</h1>
      <Suspense fallback={<p className="text-secondary">Loading…</p>}>
        <Plan />
      </Suspense>
      <Suspense fallback={<p className="text-secondary">Loading…</p>}>
        <Account />
      </Suspense>
    </main>
  );
}
