import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/Button";
import { Calendar } from "@/components/calendar/Calendar";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { requireUser } from "@/lib/auth/require-user";
import {
  buildCalendarView,
  calendarHref,
  parseCalendarParams,
  visibleRange,
} from "@/lib/calendar";
import {
  countPlannedWorkouts,
  readNextWorkouts,
  readVdot,
} from "@/lib/data/planned-workouts";
import { parisDate } from "@/lib/plan";
import { signOut } from "./actions";
import { GeneratePlanForm } from "./generate-plan-form";

async function AppHeader() {
  const user = await requireUser();

  return (
    <header className="flex flex-wrap items-center justify-between gap-inline-md">
      <p className="text-small text-secondary">sub80 · {user.email}</p>
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </header>
  );
}

const panel = [
  "flex flex-col gap-stack-sm rounded-surface bg-surface p-inset-md",
  "border-(length:--border-width-default) border-default",
].join(" ");

/** Nothing to show a calendar of yet, so the seed path lives here. */
function NoPlan() {
  return (
    <section className={panel}>
      <h1 className="text-heading-md">No plan yet</h1>
      <GeneratePlanForm />
    </section>
  );
}

/**
 * The calendar. Reads the URL and the session, so it sits inside a Suspense
 * boundary: with Cache Components on, `searchParams` is a request-time API and
 * `requireUser` opts into request time before touching cookies.
 */
async function CalendarSection({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  const [raw, user] = await Promise.all([searchParams, requireUser()]);
  const today = parisDate(new Date());

  const parsed = parseCalendarParams(raw, today);
  // A hand-edited view or date: send the browser to the default rather than
  // guessing which half of the URL was meant.
  if (!parsed.ok) redirect(calendarHref(parsed.fallback));

  const { view, date } = parsed.params;
  const { from, days } = visibleRange(view, date);

  // Three reads, one round trip. Only the visible range is fetched.
  const [planned, vdot, workouts] = await Promise.all([
    countPlannedWorkouts(user.id),
    readVdot(user.id),
    readNextWorkouts(user.id, from, days),
  ]);

  if (planned === 0) return <NoPlan />;

  return (
    <Calendar
      model={buildCalendarView(view, { date, today, workouts, vdot })}
      today={today}
    />
  );
}

export default function Home(props: PageProps<"/">) {
  return (
    <main className="flex flex-col gap-stack-md p-inset-lg">
      <Suspense fallback={<p className="text-small text-secondary">sub80</p>}>
        <AppHeader />
      </Suspense>
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarSection searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
