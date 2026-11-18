/**
 * Generates the PWA icons. Run by hand, outputs committed:
 *
 *   pnpm exec node tools/icons/generate.mts
 *
 * PLACEHOLDER. The mark is an original "80" built from rings -- two stacked
 * circles for the 8, one ellipse for the 0 -- and it exists so the app has an
 * installable icon at all. The Figma pass replaces every file this writes.
 *
 * Why it is drawn here rather than loaded from an .svg: `ImageResponse`
 * rasterises an element tree, and rings are exactly what border-radius is for,
 * so there is no SVG for satori to misread and no font to embed. Nothing in
 * this file is text.
 *
 * Why `next/og`: it ships inside the `next` package, so the rasteriser costs no
 * new dependency. `sharp` is in the lockfile only as an optional transitive
 * dependency of Next and is not importable under pnpm's strict linking.
 *
 * The colours come from the tokens, through the same resolver the manifest
 * colours use, so the icon cannot drift from the palette by hand.
 *
 * `createElement` rather than JSX because this is a `.mts` run straight by
 * node: type stripping handles TypeScript syntax, not JSX.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createElement, type CSSProperties, type ReactElement } from "react";
import { ImageResponse } from "next/og.js";
import {
  linearRgb,
  modeVariables,
  resolveToken,
  srgbHex,
} from "../../src/lib/design/contrast.ts";
import { defaultModes } from "../../src/lib/design/tokens.ts";

const root = new URL("../../", import.meta.url);
const css = readFileSync(new URL("src/styles/tokens.css", root), "utf8");
const light = modeVariables(css, { ...defaultModes, theme: "light" });

/** A token as the hex a rasteriser needs. The manifest does the same. */
const hex = (name: string) => srgbHex(linearRgb(resolveToken(light, name)));

const PLATE = hex("--color-accent");
const MARK = hex("--color-text-on-accent");

/**
 * How much of the canvas the mark may use.
 *
 * A maskable icon is cropped to whatever shape the launcher likes -- a circle,
 * a squircle, a teardrop -- and only the middle 80% is guaranteed to survive.
 * So the maskable variant keeps the mark inside that circle and lets the plate
 * run to the edges, which is the whole point of the purpose: the launcher gets
 * colour to cut and never a transparent corner.
 */
const SAFE_ZONE = 0.8;

/**
 * The plain icon is not cropped, so it only needs to not look crammed. A
 * little under full bleed, which reads better in a launcher grid than a mark
 * touching its own edges.
 */
const FULL_BLEED = 0.86;

/** A flex div. Satori lays out nothing that is not explicitly flex. */
const box = (style: CSSProperties, ...children: ReactElement[]): ReactElement =>
  createElement("div", { style: { display: "flex", ...style } }, ...children);

/**
 * The mark: an 8 of two stacked rings beside a 0 of one ellipse.
 *
 * Sized in fractions of the canvas rather than pixels, so one tree renders at
 * every size and the stroke stays in proportion instead of vanishing at 180px.
 */
function mark(size: number, inset: number): ReactElement {
  const usable = size * inset;
  // The 8 is two circles tall, so a ring is half the mark's height.
  const ring = usable * 0.42;
  const stroke = Math.max(2, Math.round(usable * 0.075));
  const overlap = stroke;

  const circle = (): ReactElement =>
    box({
      width: ring,
      height: ring,
      borderRadius: ring,
      border: `${stroke}px solid ${MARK}`,
      boxSizing: "border-box",
    });

  const eight = box(
    {
      flexDirection: "column",
      alignItems: "center",
      // The two rings share a stroke where they meet, as an 8's waist does.
      marginBottom: -overlap,
    },
    circle(),
    box({ marginTop: -overlap }, circle()),
  );

  const zero = box({
    width: ring * 0.92,
    height: ring * 2 - overlap,
    borderRadius: ring,
    border: `${stroke}px solid ${MARK}`,
    boxSizing: "border-box",
  });

  return box(
    {
      width: size,
      height: size,
      backgroundColor: PLATE,
      alignItems: "center",
      justifyContent: "center",
      gap: Math.round(usable * 0.06),
    },
    eight,
    zero,
  );
}

/** One icon, written to public/icons. */
async function write(name: string, element: ReactElement, size: number) {
  const response = new ImageResponse(element, { width: size, height: size });
  const bytes = Buffer.from(await response.arrayBuffer());
  const target = new URL(`public/icons/${name}`, root);
  writeFileSync(target, bytes);
  console.log(`${name}  ${size}x${size}  ${bytes.length} bytes`);
}

mkdirSync(new URL("public/icons", root), { recursive: true });

await write("icon-192.png", mark(192, FULL_BLEED), 192);
await write("icon-512.png", mark(512, FULL_BLEED), 512);
await write("icon-512-maskable.png", mark(512, SAFE_ZONE), 512);
await write("apple-touch-icon-180.png", mark(180, FULL_BLEED), 180);
