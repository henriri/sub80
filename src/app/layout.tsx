import type { Metadata } from "next";
import { defaultModes, modeAttributes } from "@/lib/design/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: "sub80",
  description: "Half marathon training toward 1:20.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" {...modeAttributes(defaultModes)}>
      <body>{children}</body>
    </html>
  );
}
