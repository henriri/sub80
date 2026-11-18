import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/supabase/public-paths";
import { config } from "./proxy";

/*
 * The matcher decides whether the proxy runs at all, which is the only thing
 * that gives a path no session work. It is already plain regex rather than a
 * path-to-regexp pattern, so compiling it here tests the expression itself --
 * not Next's router, which this cannot stand in for.
 */
const [matcher] = config.matcher;
const proxied = (pathname: string) => new RegExp(`^${matcher}$`).test(pathname);

/** The static files Chrome fetches before, and without, a session. */
const installFiles = [
  "/manifest.webmanifest",
  "/robots.txt",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon-180.png",
];

describe("the proxy matcher", () => {
  it("declares exactly one pattern, which is the one under test", () => {
    expect(config.matcher).toHaveLength(1);
  });

  it.each(installFiles)("never runs on %s", (path) => {
    expect(proxied(path)).toBe(false);
  });

  it.each(installFiles)("agrees with isPublicPath about %s", (path) => {
    // The matcher cannot import the list, so this is the drift test between
    // the duplicated literal and the pure function.
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/_next/static/chunks/main.js", "/_next/image"])(
    "leaves %s to Next",
    (path) => {
      expect(proxied(path)).toBe(false);
    },
  );

  it.each(["/", "/login", "/runs", "/runs/new", "/workouts/abc", "/design"])(
    "runs on %s",
    (path) => {
      expect(proxied(path)).toBe(true);
    },
  );

  it("runs on a path that only looks like an image", () => {
    // Regression guard: with one backslash the string literal dropped it, the
    // regex read `.` as any character, and /fooxpng skipped the proxy.
    expect(proxied("/fooxpng")).toBe(true);
    expect(proxied("/manifestxwebmanifest")).toBe(true);
  });
});
