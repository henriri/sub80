import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { linearRgb, modeVariables, resolveToken, srgbHex } from "./contrast";
import {
  MANIFEST_BACKGROUND_COLOR,
  MANIFEST_COLOR_TOKEN,
  MANIFEST_THEME_COLOR,
} from "./manifest-theme";
import { defaultModes } from "./tokens";

const css = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");

/** The token resolved on a light root, converted the way the manifest needs it. */
const derived = (name: string, theme = "light") =>
  srgbHex(linearRgb(resolveToken(modeVariables(css, { ...defaultModes, theme }), name)));

/*
 * The manifest is the one file that cannot read a CSS variable, so its colours
 * are literals. These tests are what keeps them honest: change the token and
 * this fails rather than the app quietly launching on last month's colour.
 */
describe("the manifest colours", () => {
  it("is still the token it was derived from", () => {
    expect(MANIFEST_THEME_COLOR).toBe(derived(MANIFEST_COLOR_TOKEN));
  });

  it("uses that same colour for the splash screen", () => {
    // The splash sits behind the icon at launch. A different white there is a
    // flash the athlete sees every time the app opens.
    expect(MANIFEST_BACKGROUND_COLOR).toBe(derived(MANIFEST_COLOR_TOKEN));
  });

  it("is the colour the body actually paints", () => {
    // globals.css: `body { background-color: var(--color-bg-canvas) }`. If that
    // ever becomes surface, this names the token to follow.
    expect(MANIFEST_COLOR_TOKEN).toBe("--color-bg-canvas");
    const globals = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(globals).toContain(`background-color: var(${MANIFEST_COLOR_TOKEN})`);
  });

  it("is a six-digit lower-case hex, which is what a manifest takes", () => {
    // MDN documents named, hex and rgb() for theme_color. oklch() in a manifest
    // is not something this repo can verify, so the token is converted.
    for (const color of [MANIFEST_THEME_COLOR, MANIFEST_BACKGROUND_COLOR]) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("is fully opaque, because a transparent theme colour is ignored", () => {
    // MDN: browsers may ignore the alpha component, and theme_color cannot be
    // transparent in most environments.
    for (const color of [MANIFEST_THEME_COLOR, MANIFEST_BACKGROUND_COLOR]) {
      expect(color).toHaveLength(7);
    }
  });

  it("is the light value, not the dark one", () => {
    // The app is always data-theme="light". Shipping the dark colour would
    // darken the status bar over a light page.
    expect(MANIFEST_THEME_COLOR).not.toBe(derived(MANIFEST_COLOR_TOKEN, "dark"));
  });
});

describe("srgbHex", () => {
  it("takes the whitest and the blackest tokens to their limits", () => {
    expect(srgbHex(linearRgb("oklch(1 0 0)"))).toBe("#ffffff");
    expect(srgbHex(linearRgb("oklch(0 0 0)"))).toBe("#000000");
  });

  it("keeps a near-white near white rather than rounding it to white", () => {
    // The canvas is a faintly blue off-white. Losing that to #ffffff would make
    // the splash brighter than the page, which is the thing this avoids.
    expect(derived("--color-bg-canvas")).toBe("#f9fafb");
    expect(derived("--color-bg-canvas")).not.toBe("#ffffff");
  });

  it("clamps a token that sits outside the sRGB gamut", () => {
    // The vivid accent steps are deliberately a little outside sRGB; a hex has
    // to be a hex regardless, and isInGamut is what reports the overflow.
    expect(srgbHex(linearRgb("oklch(0.707 0.165 255)"))).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("is a pure function of the linear channels", () => {
    expect(srgbHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
    expect(srgbHex({ r: 1, g: 1, b: 1 })).toBe("#ffffff");
    // Linear 0.5 is mid-grey in linear light, which gamma-encodes well above 128.
    expect(srgbHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe("#bcbcbc");
  });
});
