import { describe, expect, it } from "vitest";
import { monthGrid } from "./month-grid";
import { MONTH_GRID_DAYS, MONTH_GRID_ROWS } from "./range";

const flat = (date: string) => monthGrid(date).flat();

describe("monthGrid", () => {
  it("is always six rows of seven", () => {
    for (const date of ["2026-10-19", "2027-02-15", "2027-08-20", "2028-04-16"]) {
      const grid = monthGrid(date);
      expect(grid, date).toHaveLength(MONTH_GRID_ROWS);
      for (const row of grid) expect(row, date).toHaveLength(7);
      expect(flat(date), date).toHaveLength(MONTH_GRID_DAYS);
    }
  });

  it("greys nothing at the start of a month beginning on a Monday", () => {
    // February 2027 starts on a Monday and is 28 days long.
    const cells = flat("2027-02-15");
    expect(cells[0]).toEqual({ date: "2027-02-01", dayOfMonth: 1, inMonth: true });
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(28);
    // The two trailing rows are all March.
    expect(cells.slice(28).every((cell) => !cell.inMonth)).toBe(true);
    expect(cells.at(-1)).toEqual({
      date: "2027-03-14",
      dayOfMonth: 14,
      inMonth: false,
    });
  });

  it("greys six leading days for a month beginning on a Sunday", () => {
    // August 2027 starts on a Sunday and is 31 days long.
    const cells = flat("2027-08-20");
    expect(cells.slice(0, 6).map((cell) => cell.date)).toEqual([
      "2027-07-26",
      "2027-07-27",
      "2027-07-28",
      "2027-07-29",
      "2027-07-30",
      "2027-07-31",
    ]);
    expect(cells.slice(0, 6).every((cell) => !cell.inMonth)).toBe(true);
    expect(cells[6]).toEqual({ date: "2027-08-01", dayOfMonth: 1, inMonth: true });
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
  });

  it("marks exactly the days of the month it was asked for", () => {
    const cells = flat("2026-10-19");
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
    for (const cell of cells) {
      expect(cell.inMonth, cell.date).toBe(cell.date.startsWith("2026-10-"));
      expect(cell.dayOfMonth, cell.date).toBe(Number(cell.date.slice(8, 10)));
    }
  });

  it("runs in unbroken date order", () => {
    const cells = flat("2027-10-15");
    for (let i = 1; i < cells.length; i++) {
      const previous = cells[i - 1];
      const current = cells[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      expect(current!.date > previous!.date, current!.date).toBe(true);
    }
  });
});
