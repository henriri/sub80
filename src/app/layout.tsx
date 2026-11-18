import type { Metadata } from "next";
import { defaultModes, modeAttributes } from "@/lib/design/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "sub80",
  description: "Half marathon training toward 1:20.",
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
