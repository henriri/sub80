import type { CalendarViewModel } from "@/lib/calendar";
import type { MoveCandidate, Ymd } from "@/lib/plan";
import {
  CalendarBoard,
  type MoveAction,
  type UndoAction,
} from "./CalendarBoard";
import { CalendarHeader } from "./CalendarHeader";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { YearView } from "./YearView";

type CalendarProps = {
  model: CalendarViewModel;
  /** Today in Europe/Paris: what the Today button goes back to. */
  today: Ymd;
  /** Passed through to the header. 1 on `/`, deeper inside a specimen card. */
  titleLevel?: 1 | 2 | 3 | 4;
  /**
   * Whether sessions can be moved. Off by default, so /design and any other
   * read-only use render exactly what they rendered before, through the same
   * components: the move API reaches them through a context whose default is
   * null rather than through props.
   */
  interactive?: boolean;
  /** Loaded but not shown: see `CalendarBoard`. */
  neighbours?: readonly MoveCandidate[];
  /** Only /design sets these: see `CalendarBoard`. */
  onMove?: MoveAction;
  onUndo?: UndoAction;
};

function subtitleOf(model: CalendarViewModel): string | null {
  switch (model.view) {
    case "week":
      return model.rangeLabel;
    case "day":
      return model.subtitle;
    case "month":
    case "year":
      return null;
  }
}

/** The header and whichever view the URL asked for. */
export function Calendar({
  model,
  today,
  titleLevel,
  interactive,
  neighbours,
  onMove,
  onUndo,
}: CalendarProps) {
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

      {/*
        The year is never the board's: there is nothing on it to drag, so it
        renders the same whether or not the page asked for interaction.
      */}
      {model.view === "year" ? (
        <YearView year={model} titleLevel={titleLevel} />
      ) : interactive ? (
        <CalendarBoard
          model={model}
          today={today}
          neighbours={neighbours}
          onMove={onMove}
          onUndo={onUndo}
        />
      ) : (
        <>
          {model.view === "week" ? <WeekView week={model} /> : null}
          {model.view === "month" ? <MonthView month={model} /> : null}
          {model.view === "day" ? <DayView day={model} /> : null}
        </>
      )}
    </div>
  );
}
