import type { YearFocus } from "@/lib/calendar";
import { joinClasses, panel } from "./styles";

type FocusCardProps = {
  focus: YearFocus;
  headingLevel: 2 | 3 | 4 | 5;
};

const headings = { 2: "h2", 3: "h3", 4: "h4", 5: "h5" } as const;

/**
 * The month in progress: how far against how far was asked, what is left, and
 * how much of the plan that is.
 *
 * "of planned", never "of goal": there is no goal for a month. The plan asks
 * for a distance and this says how much of it has happened, which is a fact
 * rather than a target the athlete signed up to.
 *
 * With nothing planned there is no percentage and no bar -- a fraction of zero
 * is not 0% and not 100%, it is a question with no answer, and inventing one
 * would be the first dishonest number on the screen.
 */
export function FocusCard({ focus, headingLevel }: FocusCardProps) {
  const Title = headings[headingLevel];
  const { loggedKm, plannedKm, toGoKm, percent, barPercent, monthName } = focus;

  return (
    <section aria-labelledby="focus" className={joinClasses(panel, "gap-stack-sm")}>
      <Title id="focus" className="text-heading-sm">
        {monthName} in focus
      </Title>

      <p className="flex items-baseline gap-inline-xs">
        <span className="font-heading text-heading-md">
          {loggedKm} / {plannedKm} km
        </span>
      </p>

      <p className="text-small text-secondary">{toGoKm} km to go</p>

      {percent === null ? null : (
        <>
          <p className="text-small text-secondary">{percent}% of planned</p>
          {/*
            The numbers themselves, not a percentage: a screen reader hears
            "96 of 168 km" rather than a bar's own fraction. The bar is clamped
            at 100 while the sentence keeps the real figure, so a month run
            past its plan still says so.
          */}
          <div
            role="progressbar"
            aria-label={`${monthName} against its plan`}
            aria-valuemin={0}
            aria-valuemax={plannedKm}
            aria-valuenow={loggedKm}
            aria-valuetext={`${loggedKm} of ${plannedKm} km, ${percent}% of planned`}
            className="h-(--chart-progress-height) w-full overflow-hidden rounded-control bg-(--chart-progress-track)"
          >
            <span
              style={{ width: `${barPercent}%` }}
              className="block h-full bg-(--chart-progress-fill)"
            />
          </div>
        </>
      )}
    </section>
  );
}
