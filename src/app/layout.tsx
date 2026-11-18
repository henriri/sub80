import type { Metadata, Viewport } from "next";
import { MANIFEST_THEME_COLOR } from "@/lib/design/manifest-theme";
import { defaultModes, modeAttributes } from "@/lib/design/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "sub80",
  description: "Half marathon training toward 1:20.",
  manifest: "/manifest.webmanifest",
  /** The 180px icon iOS uses for a home-screen bookmark. */
  icons: { apple: "/icons/apple-touch-icon-180.png" },
  /*
   * One athlete's training log behind auth. Set once here rather than per
   * page, so a page added later is private by default; /design and /login keep
   * their own, which now say the same thing twice and cost nothing.
   */
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  /*
   * One value, light. `<html>` is pinned to `defaultModes` below, so the app is
   * always `data-theme="light"` -- dark exists in the /design preview and
   * nowhere else. A dark media variant here would darken the status bar over a
   * light page on a phone set to dark mode, which is worse than having none.
   * It goes in when a theme switcher does.
   */
  themeColor: MANIFEST_THEME_COLOR,
  /*
   * Let the viewport reach under the rounded corners and the gesture bar, so
   * the page can decide what to do about them. `<body>` reserves the insets.
   */
  viewportFit: "cover",
};

/**
 * The gutter the device keeps for itself, once, on the body.
 *
 * Installed and launched standalone with `viewport-fit=cover`, the viewport
 * reaches under the gesture bar and any rounded corner, so content at the edge
 * would sit beneath them. Every inset falls back to 0, so in a browser tab this
 * changes nothing at all -- which is why it can live here rather than being
 * threaded through each page's own `<main>`.
 *
 * No top inset: a `standalone` app keeps the status bar above the web content.
 */
const safeArea = [
  "pb-(--space-safe-bottom)",
  "pl-(--space-safe-left)",
  "pr-(--space-safe-right)",
].join(" ");

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" {...modeAttributes(defaultModes)}>
      <body className={safeArea}>{children}</body>
    </html>
  );
}
