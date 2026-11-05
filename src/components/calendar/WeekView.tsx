"use client";

import { formatKm, type WeekViewModel } from "@/lib/calendar";
import { WEEKLY_CAP } from "@/lib/plan";
import { DayColumn } from "./DayColumn";

type WeekViewProps = { week: WeekViewModel };

/** A list on a phone, seven columns once there is room for them. */
const grid = [
  "grid grid-cols-1 gap-(--cal-cell-gap)",
  "md:grid-cols-7 md:items-start",
].join(" ");

/** The week's volume against what the plan asked for. */
function Total({ week }: WeekViewProps) {
  return (
    <p className="flex flex-wrap items-baseline gap-inline-sm text-small">
      <span className="font-strong text-body">{formatKm(week.metres)}</span>
      <span className="text-secondary">
        {week.plannedKm === null
          ? "no planned volume outside the plan"
          : `of ${week.plannedKm} km planned · ${WEEKLY_CAP} km ceiling`}
      </span>
    </p>
  );
}

export function WeekView({ week }: WeekViewProps) {
  return (
    <div className="flex flex-col gap-stack-md">
      <Total week={week} />
      <div className={grid}>
        {week.days.map((day) => (
          <DayColumn key={day.date} day={day} />
        ))}
      </div>
    </div>
  );
}
