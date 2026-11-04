import { formatFullDate } from "@/lib/calendar";
import { PLAN_START, RACE_DATE } from "@/lib/plan";

type CalendarEmptyProps = {
  /** Inside the 78 plan weeks. Outside it there is nothing to plan at all. */
  inPlan: boolean;
  /** `full` explains itself; `compact` fits a week column. */
  size?: "compact" | "full";
};

/** A rest day, or a date the plan does not reach. */
export function CalendarEmpty({ inPlan, size = "compact" }: CalendarEmptyProps) {
  if (inPlan) {
    return (
      <p className="text-small text-secondary">
        {size === "full" ? "Rest day. Nothing planned." : "Rest"}
      </p>
    );
  }

  return (
    <p className="text-small text-secondary">
      Outside the plan
      {size === "full" ? (
        <>
          . The 78 weeks run from {formatFullDate(PLAN_START)} to{" "}
          {formatFullDate(RACE_DATE)}.
        </>
      ) : null}
    </p>
  );
}
