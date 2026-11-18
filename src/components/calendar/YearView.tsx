import type { YearViewModel } from "@/lib/calendar";
import { BigNumber } from "./BigNumber";
import { FocusCard } from "./FocusCard";
import { YearChart } from "./YearChart";

type YearViewProps = {
  year: YearViewModel;
  /**
   * The level of the calendar's own title. The sections below it take the next
   * one down, so `/` (an h1 title) gets h2 cards and a specimen nested under
   * an h3 on /design gets h4 ones.
   */
  titleLevel?: 1 | 2 | 3 | 4;
};

/**
 * The season: one number, twelve months, and the month in progress.
 *
 * UNSKINNED. It is laid out with tokens and it is correct -- the numbers, the
 * accessible names, the contrast and the hit areas -- but the visual design is
 * the Figma pass's, not this file's.
 *
 * Nothing here is interactive beyond its links, so unlike the other three
 * views this is a server component: no `use client`, no drag context, no
 * JavaScript shipped for it at all.
 */
export function YearView({ year, titleLevel = 1 }: YearViewProps) {
  const headingLevel = (titleLevel + 1) as 2 | 3 | 4 | 5;

  return (
    <div className="flex flex-col gap-stack-md">
      <BigNumber
        eyebrow="The big picture"
        value={year.loggedKm}
        unit="km"
        caption={`of ${year.plannedKm} km planned`}
      />

      <YearChart year={year} headingLevel={headingLevel} />

      {/* Only the year that contains today has a month in progress. */}
      {year.focus === null ? null : (
        <FocusCard focus={year.focus} headingLevel={headingLevel} />
      )}
    </div>
  );
}
