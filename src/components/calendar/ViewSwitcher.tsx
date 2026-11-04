import Link from "next/link";
import { CALENDAR_VIEWS, calendarHref, type CalendarView } from "@/lib/calendar";
import type { Ymd } from "@/lib/plan";
import { joinClasses, navLink, navLinkCurrent } from "./styles";

type ViewSwitcherProps = { view: CalendarView; date: Ymd };

const labels: Record<CalendarView, string> = {
  week: "Week",
  month: "Month",
  day: "Day",
};

/** Three links, so switching view keeps the date and needs no JavaScript. */
export function ViewSwitcher({ view, date }: ViewSwitcherProps) {
  return (
    <nav aria-label="Calendar view" className="flex gap-(--cal-header-gap)">
      {CALENDAR_VIEWS.map((candidate) => (
        <Link
          key={candidate}
          href={calendarHref({ view: candidate, date })}
          aria-current={candidate === view ? "page" : undefined}
          className={joinClasses(navLink, candidate === view && navLinkCurrent)}
        >
          {labels[candidate]}
        </Link>
      ))}
    </nav>
  );
}
