import Link from "next/link";
import { calendarHref, step, type CalendarView } from "@/lib/calendar";
import type { Ymd } from "@/lib/plan";
import { ViewSwitcher } from "./ViewSwitcher";
import { navLink } from "./styles";

type CalendarHeaderProps = {
  view: CalendarView;
  date: Ymd;
  today: Ymd;
  /** 'Week 13 · Aerobic base · Build week', or 'March 2027'. */
  title: string;
  /** '19 – 25 Oct 2026' under a week title. Months and days need no second line. */
  subtitle?: string | null;
  /**
   * The title is the page heading on `/`. The specimen page on `/design`
   * already owns its own `h1`, so it asks for a deeper level instead.
   */
  titleLevel?: 1 | 2 | 3 | 4;
};

const unit: Record<CalendarView, string> = {
  week: "week",
  month: "month",
  day: "day",
};

const headings = { 1: "h1", 2: "h2", 3: "h3", 4: "h4" } as const;

export function CalendarHeader({
  view,
  date,
  today,
  title,
  subtitle,
  titleLevel = 1,
}: CalendarHeaderProps) {
  const Title = headings[titleLevel];

  return (
    <div className="flex flex-col gap-stack-sm bg-(--cal-header-bg)">
      <div className="flex flex-wrap items-center gap-(--cal-header-gap)">
        <ViewSwitcher view={view} date={date} />

        <nav
          aria-label="Move through the calendar"
          className="flex gap-(--cal-header-gap)"
        >
          <Link
            href={calendarHref({ view, date: step(view, date, -1) })}
            aria-label={`Previous ${unit[view]}`}
            className={navLink}
          >
            <span aria-hidden="true">←</span>
          </Link>
          <Link
            href={calendarHref({ view, date: today })}
            aria-label={`Today, in the ${unit[view]} view`}
            className={navLink}
          >
            Today
          </Link>
          <Link
            href={calendarHref({ view, date: step(view, date, 1) })}
            aria-label={`Next ${unit[view]}`}
            className={navLink}
          >
            <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </div>

      <div className="flex flex-col">
        <Title className="text-heading-md">{title}</Title>
        {subtitle ? <p className="text-small text-secondary">{subtitle}</p> : null}
      </div>
    </div>
  );
}
