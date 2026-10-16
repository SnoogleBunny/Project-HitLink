import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { ThemeScript } from "@flowstate/ui";
import { publicMemberOrigin } from "../lib/gym-website";
import "./globals.css";
import "@flowstate/ui/styles.css";

const sourceSans = localFont({
  src: "../../../packages/ui/fonts/SourceSans3-Variable.ttf",
  variable: "--font-source-sans",
  weight: "200 900",
  display: "swap",
  fallback: ["Segoe UI", "Arial"],
});
const barlow = localFont({
  src: [
    {
      path: "../../../packages/ui/fonts/BarlowSemiCondensed-SemiBold.ttf",
      weight: "600",
    },
    {
      path: "../../../packages/ui/fonts/BarlowSemiCondensed-Bold.ttf",
      weight: "700",
    },
  ],
  variable: "--font-barlow",
  display: "swap",
  fallback: ["Arial Narrow", "Segoe UI"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicMemberOrigin()),
  title: { default: "HitLink Member Portal", template: "%s · HitLink" },
  description: "Book classes and manage your membership.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${barlow.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
