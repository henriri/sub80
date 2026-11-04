import { DAYS_IN_WEEK } from "@/lib/calendar";

const bar = "h-(--space-10) rounded-(--cal-cell-radius) bg-raised";

/**
 * The Suspense fallback. It ships in the static shell, so it must not read the
 * URL, the clock or the database: seven neutral bars, no dates.
 */
export function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-stack-md" aria-busy="true">
      <p className="text-secondary">Loading the calendar…</p>
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-(--cal-cell-gap) md:grid-cols-7"
      >
        {Array.from({ length: DAYS_IN_WEEK }, (_, index) => (
          <div key={index} className={bar} />
        ))}
      </div>
    </div>
  );
}
