/**
 * The two colours the web app manifest needs, as literal hex.
 *
 * A manifest has no cascade, no `var()` and no computed value, so this is the
 * one place in the repo where a token's VALUE is written out rather than
 * referenced. `src/lib/design/tokens.ts` holds token names only, so these came
 * from the stylesheet itself: `modeVariables` and `resolveToken` resolve
 * `--color-bg-canvas` on a light root, and `srgbHex(linearRgb(...))` converts
 * the `oklch()` it ends at. manifest-theme.test.ts re-runs exactly that and
 * fails if these drift, so they are derived values under a lock rather than
 * numbers somebody typed.
 *
 * `--color-bg-canvas` and not `--color-bg-surface`, because globals.css paints
 * `body { background-color: var(--color-bg-canvas) }`: this is the colour the
 * app actually shows, so the splash screen matches the page it opens into
 * instead of flashing a brighter white first.
 *
 * Light only. `<html>` is hardcoded to `defaultModes` in layout.tsx, so the app
 * is always `data-theme="light"` -- dark exists in the /design preview and
 * nowhere else. A dark `theme_color` media variant would darken the status bar
 * over a light page on a phone set to dark mode, which is worse than not
 * having one. It goes in when a theme switcher does.
 */

/** `--color-bg-canvas`, light theme, default palette: `oklch(0.985 0.002 260)`. */
export const MANIFEST_THEME_COLOR = "#f9fafb";

/** The splash screen behind the icon while the app starts. The same colour. */
export const MANIFEST_BACKGROUND_COLOR = "#f9fafb";

/** The token both are derived from, so the test and the comment cannot drift. */
export const MANIFEST_COLOR_TOKEN = "--color-bg-canvas";
