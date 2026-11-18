import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/Button";
import { Calendar } from "@/components/calendar/Calendar";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { requireUser } from "@/lib/auth/require-user";
import {
  buildCalendarView,
  calendarHref,
  fetchRange,
  parseCalendarParams,
  visibleEnd,
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
  // The visible range plus a day either side, so a drop on the first or last
  // visible day can see the neighbour it would land next to and the
  // consecutive-key warning appears before the drop rather than after it.
  const { from, days } = fetchRange(view, date);

  // Three reads, one round trip. Only the range the rules need is fetched.
  const [planned, vdot, workouts] = await Promise.all([
    countPlannedWorkouts(user.id),
    readVdot(user.id),
    readNextWorkouts(user.id, from, days),
  ]);

  if (planned === 0) return <NoPlan />;

  // The padding days are move candidates only. `buildCalendarView` reads just
  // the dates it renders, so they cannot reach a day, a total or the grid; the
  // board gets them separately, beside the model rather than inside it.
  const visible = { from: visibleRange(view, date).from, to: visibleEnd(view, date) };
  const neighbours = workouts.filter(
    (workout) =>
      workout.planned_date < visible.from || workout.planned_date > visible.to,
  );

  /*
   * The calendar, and nothing beneath it.
   *
   * There is no change history here. `plan_events` is still written by every
   * plan change and `undo_plan_event` still reverses the newest one -- the undo
   * toast that appears after a change is how that is reached, while the change
   * is still the thing on the athlete's mind. A standing list of what was
   * rearranged weeks ago is not what a training calendar is for, and nothing
   * read the table any more, so its loader went with the list.
   */
  return (
    <Calendar
      model={buildCalendarView(view, { date, today, workouts, vdot })}
      today={today}
      neighbours={neighbours}
      interactive
    />
  );
}

/**
 * A narrow gutter on a phone: a month grid needs the width for seven 44px
 * columns. Wider screens get the usual page inset.
 */
export default function Home(props: PageProps<"/">) {
  return (
    <main className="flex flex-col gap-stack-md p-inset-sm md:p-inset-lg">
      <Suspense fallback={<p className="text-small text-secondary">sub80</p>}>
        <AppHeader />
      </Suspense>
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarSection searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
