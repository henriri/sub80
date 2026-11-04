import { describe, expect, it } from "vitest";
import { WORKOUT_KINDS } from "@/lib/plan";
import { KIND_META, isEventKind } from "./kinds";

describe("KIND_META", () => {
  it("covers every workout kind and nothing else", () => {
    expect(Object.keys(KIND_META).sort()).toEqual([...WORKOUT_KINDS].sort());
  });

  it("gives every kind a label and a marker, so colour is never alone", () => {
    for (const kind of WORKOUT_KINDS) {
      const meta = KIND_META[kind];
      expect(meta.label.length, kind).toBeGreaterThan(0);
      expect(meta.short.length, kind).toBeGreaterThan(0);
      expect(meta.short.length, kind).toBeLessThanOrEqual(2);
    }
  });

  it("keeps the markers distinct, so one never reads as another", () => {
    const shorts = WORKOUT_KINDS.map((kind) => KIND_META[kind].short);
    expect(new Set(shorts).size).toBe(shorts.length);
  });
});

describe("isEventKind", () => {
  it("is true only for a race or a time trial", () => {
    const events = WORKOUT_KINDS.filter(isEventKind);
    expect(events).toEqual(["tt", "race"]);
  });
});
