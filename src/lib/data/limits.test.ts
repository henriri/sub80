import { describe, expect, it } from "vitest";
import { POSTGREST_MAX_ROWS, assertAllRows } from "./limits";

describe("assertAllRows", () => {
  it("passes a read that came back short of the limit", () => {
    expect(() => assertAllRows(0, "The year's runs")).not.toThrow();
    expect(() => assertAllRows(312, "The year's runs")).not.toThrow();
    expect(() =>
      assertAllRows(POSTGREST_MAX_ROWS - 1, "The year's runs"),
    ).not.toThrow();
  });

  it("refuses a read that came back full", () => {
    // Full and truncated are indistinguishable from here, and both mean the
    // read has outgrown one request.
    expect(() => assertAllRows(POSTGREST_MAX_ROWS, "The year's runs")).toThrow(
      /1000-row limit/,
    );
  });

  it("names what was being read, so the error says where to look", () => {
    expect(() => assertAllRows(10, "The year's sessions", 10)).toThrow(
      /The year's sessions/,
    );
  });

  it("says it is refusing rather than truncating", () => {
    expect(() => assertAllRows(5, "Something", 5)).toThrow(/truncating/);
  });
});
