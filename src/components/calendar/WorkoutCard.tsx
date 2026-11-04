import { formatKm, type CalendarItem } from "@/lib/calendar";
import { KindBadge } from "./KindBadge";
import { joinClasses } from "./styles";

type WorkoutCardProps = {
  item: CalendarItem;
  /** `compact` sits in a week column or a month cell; `full` is the day view. */
  size?: "compact" | "full";
};

const base = [
  "flex flex-col gap-(--cal-card-gap)",
  "min-h-(--cal-card-min-height)",
  "px-(--cal-card-padding-x) py-(--cal-card-padding-y)",
  "rounded-(--cal-card-radius) bg-(--cal-card-bg) text-(color:--cal-card-fg)",
  "border-(length:--border-width-default) border-(--cal-card-border)",
].join(" ");

function KeySession() {
  return (
    <>
      {" "}
      <span aria-hidden="true">★</span>
      <span className="sr-only">(key session)</span>
    </>
  );
}

/**
 * One planned session. The element id and `data-workout-id` are the row id, so
 * the card a drag will pick up is already addressable.
 */
export function WorkoutCard({ item, size = "compact" }: WorkoutCardProps) {
  return (
    <article
      id={`workout-${item.id}`}
      data-workout-id={item.id}
      className={joinClasses(base, size === "full" && "gap-stack-sm")}
    >
      <div className="flex flex-wrap items-center justify-between gap-inline-sm">
        <KindBadge kind={item.kind} />
        {item.metres === null ? null : (
          <span className="text-small text-secondary">{formatKm(item.metres)}</span>
        )}
      </div>

      <h3 className={size === "full" ? "text-heading-sm" : "font-strong text-small"}>
        {item.title}
        {item.isKey ? <KeySession /> : null}
      </h3>

      {item.paceLabel === null ? null : (
        <p className="flex flex-wrap items-center gap-inline-sm text-small text-secondary">
          <span className="rounded-control bg-raised px-inline-sm font-code">
            {item.paceZone}
          </span>
          {item.paceLabel}
        </p>
      )}

      {item.strides ? (
        <p className="text-small text-secondary">
          {size === "full" ? "Finishes with strides." : "+ strides"}
        </p>
      ) : null}
    </article>
  );
}
