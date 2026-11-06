import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/Button";
import { Calendar } from "@/components/calendar/Calendar";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { RecentChanges } from "@/components/calendar/RecentChanges";
import { requireUser } from "@/lib/auth/require-user";
import {
  buildCalendarView,
  calendarHref,
  parseCalendarParams,
  undoableIndex,
  visibleRange,
} from "@/lib/calendar";
import { readRecentPlanEvents } from "@/lib/data/plan-events";
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

/** How much history "Recent changes" shows. */
const RECENT_CHANGES = 10;

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

  // Four reads, one round trip. Only the visible range of workouts is fetched.
  const [planned, vdot, workouts, events] = await Promise.all([
    countPlannedWorkouts(user.id),
    readVdot(user.id),
    readNextWorkouts(user.id, from, days),
    readRecentPlanEvents(user.id, RECENT_CHANGES),
  ]);

  if (planned === 0) return <NoPlan />;

  // Undo is a stack, so exactly one row may be undone and it is not always
  // the first: an undo, or an already undone move, can sit above it.
  const undoable = undoableIndex(events);
  const changes = events.map((event, index) => ({
    id: event.id,
    kind: event.kind,
    status: event.status,
    move: event.move,
    undoable: index === undoable,
  }));

  return (
    <>
      <Calendar
        model={buildCalendarView(view, { date, today, workouts, vdot })}
        today={today}
        interactive
      />
      <RecentChanges changes={changes} />
    </>
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
