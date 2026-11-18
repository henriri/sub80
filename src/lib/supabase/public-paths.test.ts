import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/design",
    "/design/colors",
    // The install surface. Chrome fetches the manifest with no cookies, so a
    // redirect here breaks the install rather than prompting a sign-in.
    "/manifest.webmanifest",
    "/robots.txt",
    "/favicon.ico",
    "/icons/icon-192.png",
    "/icons/apple-touch-icon-180.png",
    // A trailing slash is the same path.
    "/login/",
  ])("allows %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/", "/plan", "/activities/1", "/runs", "/runs/new", "/workouts/abc"])(
    "protects %s",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );

  // A prefix match on a bare string would hand out whole trees by accident, and
  // an exact match on a file is only exact if nothing may be appended to it.
  it.each([
    "/login-help",
    "/designer",
    "/iconsfoo",
    "/icons-private/x.png",
    "/manifest.webmanifest.evil",
    "/manifest.webmanifestextra",
    "/robots.txt.html",
  ])("protects the lookalike %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  // Judged by where the path lands, not how it is spelled -- including the
  // encoded form, because `%2e%2e` is a `..` the router resolves.
  it.each([
    "/icons/../runs",
    "/icons/%2e%2e/runs",
    "/icons/./../../runs",
    "/login/../",
    "//runs",
    "/design/../runs",
  ])("protects the traversal %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  it("treats a malformed escape as private rather than throwing", () => {
    expect(isPublicPath("/icons/%E0%A4")).toBe(false);
  });
});
