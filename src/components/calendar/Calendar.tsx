import type { CalendarViewModel } from "@/lib/calendar";
import type { Ymd } from "@/lib/plan";
import { CalendarHeader } from "./CalendarHeader";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

type CalendarProps = {
  model: CalendarViewModel;
  /** Today in Europe/Paris: what the Today button goes back to. */
  today: Ymd;
  /** Passed through to the header. 1 on `/`, deeper inside a specimen card. */
  titleLevel?: 1 | 2 | 3 | 4;
};

function subtitleOf(model: CalendarViewModel): string | null {
  switch (model.view) {
    case "week":
      return model.rangeLabel;
    case "day":
      return model.subtitle;
    case "month":
      return null;
  }
}

/** The header and whichever view the URL asked for. */
export function Calendar({ model, today, titleLevel }: CalendarProps) {
  return (
    <div className="flex flex-col gap-stack-md">
      <CalendarHeader
        view={model.view}
        date={model.date}
        today={today}
        title={model.title}
        subtitle={subtitleOf(model)}
        titleLevel={titleLevel}
      />

      {model.view === "week" ? <WeekView week={model} /> : null}
      {model.view === "month" ? <MonthView month={model} /> : null}
      {model.view === "day" ? <DayView day={model} /> : null}
    </div>
  );
}
