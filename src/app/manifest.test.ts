import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MANIFEST_BACKGROUND_COLOR,
  MANIFEST_THEME_COLOR,
} from "@/lib/design/manifest-theme";
import manifest from "./manifest";

const app = manifest();
const icons = app.icons ?? [];

const publicFile = (src: string) => new URL(`../../public${src}`, import.meta.url);

/**
 * A PNG's real size, from the IHDR chunk: width and height are big-endian
 * 32-bit integers at bytes 16 and 20.
 *
 * Read from the file rather than taken from the manifest, because the failure
 * a hand-written manifest actually has is a `sizes` that no longer matches what
 * was generated -- which a launcher resolves by picking the wrong icon or none.
 */
function pngSize(src: string): { width: number; height: number } {
  const bytes = readFileSync(publicFile(src));
  expect(bytes.subarray(1, 4).toString("ascii"), `${src} is a PNG`).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/*
 * Chromium installs an app when the manifest carries name or short_name, a 192
 * and a 512 icon, start_url, a qualifying display, and no
 * prefer_related_applications. No service worker is required for that, and
 * this app deliberately has none.
 */
describe("the web app manifest", () => {
  it("is named", () => {
    expect(app.name).toBe("sub80");
    expect(app.short_name).toBe("sub80");
  });

  it("opens the calendar, and scopes the whole app", () => {
    expect(app.start_url).toBe("/");
    expect(app.scope).toBe("/");
  });

  it("pins an id, so moving start_url never installs a second icon", () => {
    expect(app.id).toBe("/");
  });

  it("launches standalone, which is what removes the address bar", () => {
    expect(app.display).toBe("standalone");
  });

  it("is portrait: the phone is not used during workouts", () => {
    expect(app.orientation).toBe("portrait");
  });

  it("does not point Android at a native app instead", () => {
    // prefer_related_applications: true would make Chromium refuse to install
    // this and offer a Play Store listing that does not exist.
    expect(app).not.toHaveProperty("prefer_related_applications");
  });

  it("carries the two icon sizes Chromium requires", () => {
    const any = icons.filter((icon) => icon.purpose === "any");
    expect(any.map((icon) => icon.sizes).sort()).toEqual(["192x192", "512x512"]);
  });

  it("carries a separate maskable icon, never one claiming both purposes", () => {
    // "any maskable" on one file means the plain artwork gets cropped by the
    // launcher's mask: one of the two uses always looks wrong. Next's own
    // type for `purpose` rules the combined value out, so this only has to
    // prove the maskable one is its own entry.
    const maskable = icons.filter((icon) => icon.purpose === "maskable");
    expect(maskable).toHaveLength(1);
    expect(maskable[0]?.sizes).toBe("512x512");
    expect(maskable[0]?.src).not.toBe(icons[0]?.src);
  });

  it("declares every icon as a PNG", () => {
    expect(icons.every((icon) => icon.type === "image/png")).toBe(true);
    expect(icons).toHaveLength(3);
  });

  it("points at files that exist, at the size it claims", () => {
    for (const icon of icons) {
      const src = String(icon.src);
      expect(existsSync(publicFile(src)), `${src} exists`).toBe(true);

      const [declared] = String(icon.sizes).split("x");
      const actual = pngSize(src);
      expect(actual.width, `${src} width`).toBe(Number(declared));
      expect(actual.height, `${src} is square`).toBe(actual.width);
    }
  });

  it("uses the colours derived from the tokens", () => {
    expect(app.theme_color).toBe(MANIFEST_THEME_COLOR);
    expect(app.background_color).toBe(MANIFEST_BACKGROUND_COLOR);
  });

  it("offers the two things the athlete opens the app to do", () => {
    expect(app.shortcuts?.map((shortcut) => shortcut.url)).toEqual([
      "/runs/new",
      "/",
    ]);
    expect(app.shortcuts?.map((shortcut) => shortcut.name)).toEqual([
      "Log a run",
      "Calendar",
    ]);
  });

  it("keeps every shortcut inside the scope it declares", () => {
    // A shortcut outside scope opens in a browser tab instead of the app.
    for (const shortcut of app.shortcuts ?? []) {
      expect(shortcut.url.startsWith(String(app.scope))).toBe(true);
    }
  });
});

describe("the apple touch icon", () => {
  it("exists at the size the layout points at", () => {
    const src = "/icons/apple-touch-icon-180.png";
    expect(existsSync(publicFile(src))).toBe(true);
    expect(pngSize(src)).toEqual({ width: 180, height: 180 });
  });
});
