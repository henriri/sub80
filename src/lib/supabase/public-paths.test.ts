import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it.each(["/login", "/design", "/design/colors"])("allows %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/", "/plan", "/activities/1", "/login-help", "/designer"])(
    "protects %s",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
