import Link from "next/link";
import { calendarHref, stepTarget, type CalendarView } from "@/lib/calendar";
import type { Ymd } from "@/lib/plan";
import { ViewSwitcher } from "./ViewSwitcher";
import { joinClasses, navLink } from "./styles";

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
  year: "year",
};

const headings = { 1: "h1", 2: "h2", 3: "h3", 4: "h4" } as const;

/**
 * Previous or next.
 *
 * A step with nowhere to go is a disabled control rather than a missing one:
 * the year view stops at the years the plan runs through, and a button that
 * vanished at the edge would move the two beside it under the thumb that was
 * reaching for them. `aria-disabled` with no href keeps it out of the tab
 * order while leaving it where it was.
 */
function StepLink({
  view,
  date,
  delta,
  children,
}: {
  view: CalendarView;
  date: Ymd;
  delta: -1 | 1;
  children: string;
}) {
  const target = stepTarget(view, date, delta);
  const label = `${delta < 0 ? "Previous" : "Next"} ${unit[view]}`;

  if (target === null) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className={joinClasses(navLink, "text-secondary")}
      >
        <span aria-hidden="true">{children}</span>
      </span>
    );
  }

  return (
    <Link
      href={calendarHref({ view, date: target })}
      aria-label={label}
      className={navLink}
    >
      <span aria-hidden="true">{children}</span>
    </Link>
  );
}

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
          <StepLink view={view} date={date} delta={-1}>
            ←
          </StepLink>
          <Link
            href={calendarHref({ view, date: today })}
            aria-label={`Today, in the ${unit[view]} view`}
            className={navLink}
          >
            Today
          </Link>
          <StepLink view={view} date={date} delta={1}>
            →
          </StepLink>
        </nav>

        {/*
          The logbook, from the calendar. A separate nav from the one that
          moves through the plan: these two leave the calendar rather than
          scroll it, and a screen reader should hear the difference.
        */}
        <nav aria-label="Runs" className="flex gap-(--cal-header-gap)">
          <Link href="/runs/new" className={navLink}>
            Log a run
          </Link>
          <Link href="/runs" className={navLink}>
            All runs
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
