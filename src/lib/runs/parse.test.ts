import { describe, expect, it } from "vitest";
import {
  isBlank,
  kmToMetres,
  paceSecPerKm,
  parseClock,
  parseDecimal,
  parseDur,
  parseKm,
  parseWhole,
} from "./parse";

describe("isBlank", () => {
  it("treats an empty field and a field of spaces as unfilled", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
  });

  it("does not treat a zero as unfilled", () => {
    expect(isBlank("0")).toBe(false);
  });
});

describe("parseDur", () => {
  it("reads 'm:ss'", () => {
    expect(parseDur("42:30")).toBe(2550);
    expect(parseDur("7:05")).toBe(425);
  });

  it("reads 'h:mm:ss'", () => {
    expect(parseDur("1:23:45")).toBe(5025);
    expect(parseDur("2:00:00")).toBe(7200);
  });

  it("reads bare minutes", () => {
    expect(parseDur("45")).toBe(2700);
    expect(parseDur("1")).toBe(60);
  });

  it("reads bare minutes with either decimal separator", () => {
    expect(parseDur("45,5")).toBe(2730);
    expect(parseDur("45.5")).toBe(2730);
  });

  it("rounds a decimal minute to the nearest second", () => {
    // 0.3333 min is 19.998 s, which is a 20-second run, not a 19-second one.
    expect(parseDur("0,3333")).toBe(20);
  });

  it("ignores surrounding space", () => {
    expect(parseDur("  42:30  ")).toBe(2550);
  });

  /*
   * The deliberate refusal. '7:5' could be 7:05 or 7:50, and guessing wrong
   * moves a 10 km pace by 4.5 s/km, so it is not a duration at all.
   */
  it("refuses a one-digit seconds field, which is ambiguous", () => {
    expect(parseDur("7:5")).toBeNull();
    expect(parseDur("1:23:4")).toBeNull();
  });

  it("refuses sixty or more minutes or seconds inside a colon form", () => {
    expect(parseDur("7:60")).toBeNull();
    expect(parseDur("1:60:00")).toBeNull();
  });

  it("refuses anything that is not a duration", () => {
    for (const raw of ["", "   ", "abc", "-5", "7:", ":30", "1:2:3:4", "7.5:30", "1e3"]) {
      expect(parseDur(raw), raw).toBeNull();
    }
  });

  it("allows bare minutes above an hour, since there is no hours field to carry them", () => {
    expect(parseDur("90")).toBe(5400);
  });
});

describe("parseDecimal and parseKm", () => {
  it("reads a comma and a dot as the same number", () => {
    expect(parseKm("7,5")).toBe(7.5);
    expect(parseKm("7.5")).toBe(7.5);
  });

  it("reads a whole number", () => {
    expect(parseKm("10")).toBe(10);
  });

  it("refuses two separators, spaces inside, and the shapes Number() would accept", () => {
    for (const raw of ["", "7.5.2", "1 000", "0x10", "Infinity", "-7", "+7", "7,", ",5", "1e3"]) {
      expect(parseDecimal(raw), raw).toBeNull();
    }
  });

  it("accepts a leading zero and a zero", () => {
    expect(parseKm("0")).toBe(0);
    expect(parseKm("0,1")).toBe(0.1);
  });
});

describe("kmToMetres", () => {
  it("converts whole and fractional kilometres", () => {
    expect(kmToMetres(7.5)).toBe(7500);
    expect(kmToMetres(10)).toBe(10_000);
    expect(kmToMetres(0.1)).toBe(100);
  });

  it("rounds rather than truncates", () => {
    expect(kmToMetres(7.4999)).toBe(7500);
    expect(kmToMetres(7.0004)).toBe(7000);
  });
});

describe("parseWhole", () => {
  it("reads a whole number", () => {
    expect(parseWhole("148")).toBe(148);
    expect(parseWhole("4")).toBe(4);
  });

  it("refuses a decimal, a sign and anything else", () => {
    for (const raw of ["", "148.5", "148,5", "-4", "+4", "abc", "1e3"]) {
      expect(parseWhole(raw), raw).toBeNull();
    }
  });
});

describe("parseClock", () => {
  it("reads the 'HH:MM' a time input produces", () => {
    expect(parseClock("07:30")).toBe("07:30");
    expect(parseClock("00:00")).toBe("00:00");
    expect(parseClock("23:59")).toBe("23:59");
  });

  it("refuses an impossible clock time and a loose shape", () => {
    for (const raw of ["", "24:00", "07:60", "7:30", "07:30:00", "abc"]) {
      expect(parseClock(raw), raw).toBeNull();
    }
  });
});

describe("paceSecPerKm", () => {
  it("is seconds divided by kilometres", () => {
    expect(paceSecPerKm(10_000, 3000)).toBe(300);
    expect(paceSecPerKm(7500, 2550)).toBe(340);
  });

  it("is infinite without a distance, rather than a division by zero", () => {
    expect(paceSecPerKm(0, 3000)).toBe(Number.POSITIVE_INFINITY);
  });
});
