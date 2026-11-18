import Link from "next/link";
import type { YearMonth, YearViewModel } from "@/lib/calendar";
import { focusRing, joinClasses, panel } from "./styles";

type YearChartProps = {
  year: YearViewModel;
  /** One below the calendar's own title, so the page's outline stays in order. */
  headingLevel: 2 | 3 | 4 | 5;
};

const headings = { 2: "h2", 3: "h3", 4: "h4", 5: "h5" } as const;

/** One series in the legend: a swatch and the word for it. */
function Key({ swatch, children }: { swatch: string; children: string }) {
  return (
    <span className="flex items-center gap-inline-xs">
      <span
        aria-hidden="true"
        className={joinClasses("block size-(--chart-swatch-size)", swatch)}
      />
      {children}
    </span>
  );
}

/** The planned bar's own outline, which is what carries its meaning. */
const plannedBar = [
  "bg-(--chart-planned-bg)",
  "border-(length:--border-width-default) border-(--chart-planned-border)",
].join(" ");

/**
 * One bar.
 *
 * The height is a percentage of the axis, computed in the model, so there is
 * no literal design value here and nothing to keep in step with the CSS.
 * `--chart-bar-min-height` is the floor: half a percent of the plot would
 * round away to nothing and read as a month in which nothing happened.
 *
 * A series with no value keeps its slot and draws nothing, so the other bar
 * stays in the same half of the column it would otherwise be in.
 */
function Bar({ percent, fill }: { percent: number; fill: string }) {
  if (percent <= 0) return <span aria-hidden="true" className="flex-1" />;

  return (
    <span
      aria-hidden="true"
      style={{ height: `${percent}%` }}
      className={joinClasses("block min-h-(--chart-bar-min-height) flex-1", fill)}
    />
  );
}

/**
 * One month: the link into that month of the Month view, its two bars and its
 * initial.
 *
 * The hit area is the whole column, bars and label together, and the columns
 * have no gaps between them, so a thumb anywhere over the plot lands on a
 * month. It is about 28px wide at 390px -- under the 44px minimum across, and
 * well over it down -- which is the same trade the month grid's cells already
 * make at seven columns.
 *
 * The current month is marked three ways, only one of them colour: a rule
 * beneath the column where the others have none, its initial in bold, and
 * "this month" inside the link's accessible name.
 */
function Column({ month }: { month: YearMonth }) {
  return (
    <Link
      href={month.href}
      aria-label={month.label}
      aria-current={month.isCurrent ? "date" : undefined}
      className={joinClasses("relative flex flex-col", focusRing)}
    >
      <span className="flex h-(--chart-plot-height) items-end justify-center gap-inline-xs px-inline-xs">
        {month.hasData ? (
          <>
            <Bar percent={month.loggedPercent} fill="bg-(--chart-logged-bg)" />
            <Bar percent={month.plannedPercent} fill={plannedBar} />
          </>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={joinClasses(
          "py-inline-xs text-center text-small",
          month.isCurrent ? "font-strong text-primary" : "text-(color:--chart-axis-fg)",
        )}
      >
        {month.initial}
      </span>
      {month.isCurrent ? (
        // Absolute, so the rule does not make this column a different height
        // from the eleven without one and tip the row of initials out of line.
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 border-t-(length:--chart-current-width) border-(--chart-current-accent)"
        />
      ) : null}
    </Link>
  );
}

/**
 * Twelve months of what was run against what was asked for.
 *
 * The plot is markup rather than a chart library: twelve columns, two bars
 * each, heights as percentages of a shared axis. No dependency, and every
 * colour and dimension is a token.
 */
export function YearChart({ year, headingLevel }: YearChartProps) {
  const Title = headings[headingLevel];
  const { axis } = year;
  const empty = axis.max === 0;

  return (
    <section
      aria-labelledby={`chart-${year.year}`}
      className={joinClasses(panel, "gap-stack-md")}
    >
      <Title id={`chart-${year.year}`} className="text-heading-sm">
        Distance by month
      </Title>

      {/* The series are named in words: the fills are a shorthand, not the
          only way to tell the two apart. */}
      <p className="flex flex-wrap gap-inline-md text-small text-secondary">
        <Key swatch="bg-(--chart-logged-bg)">Logged</Key>
        <Key swatch={plannedBar}>Planned</Key>
      </p>

      <div className="flex items-start gap-inline-xs">
        <div
          aria-hidden="true"
          className="relative h-(--chart-plot-height) w-(--chart-axis-width)"
        >
          {axis.ticks.map((tick) => (
            <span
              key={tick}
              style={{ bottom: `${(tick / (axis.max || 1)) * 100}%` }}
              className="absolute right-0 translate-y-1/2 text-small text-(color:--chart-axis-fg)"
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-(--chart-plot-height)"
          >
            {axis.ticks.map((tick) => (
              <span
                key={tick}
                style={{ bottom: `${(tick / (axis.max || 1)) * 100}%` }}
                className="absolute inset-x-0 border-t-(length:--border-width-default) border-(--chart-gridline)"
              />
            ))}
          </div>

          {/* No gap: the hit areas touch, so there is nowhere between two
              months for a thumb to land. */}
          <div className="relative grid grid-cols-12">
            {year.months.map((month) => (
              <Column key={month.month} month={month} />
            ))}
          </div>
        </div>
      </div>

      <p className="text-small text-secondary">
        {empty
          ? `Nothing planned or logged in ${year.year} yet.`
          : "Kilometres. Each column opens that month."}
      </p>
    </section>
  );
}
