"use client";

import { formatKm, type DayViewModel } from "@/lib/calendar";
import { CalendarEmpty } from "./CalendarEmpty";
import { WorkoutCard } from "./WorkoutCard";

type DayViewProps = { day: DayViewModel };

/** The day's sessions as full cards: distance, pace range and strides. */
export function DayView({ day }: DayViewProps) {
  const { items, metres, inPlan } = day.day;

  return (
    <section
      data-date={day.date}
      className="flex flex-col gap-stack-md"
      aria-label="Planned sessions"
    >
      <h2 className="sr-only">Planned sessions</h2>

      {items.length === 0 ? (
        <CalendarEmpty inPlan={inPlan} size="full" />
      ) : (
        <>
          <p className="text-small text-secondary">
            <span className="font-strong text-body text-primary">
              {formatKm(metres)}
            </span>{" "}
            planned
          </p>
          <div className="flex flex-col gap-stack-sm">
            {items.map((item) => (
              <WorkoutCard key={item.id} item={item} size="full" />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
