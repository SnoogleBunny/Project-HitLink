import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Manrope } from "next/font/google";
import { competitors, site } from "../lib/content";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const title = `${site.name} | ${site.tagline}`;
const metadataBase = new URL(
  process.env.NEXT_PUBLIC_FLOWSTATE_APP_URL ?? "http://localhost:3003",
);

export const metadata: Metadata = {
  metadataBase,
  title,
  description: site.description,
  keywords: [
    "martial arts gym software",
    "Muay Thai gym management software",
    "martial arts school management software",
    "gym management software replacement",
    ...competitors.map((competitor) => `${competitor} alternative`),
  ],
  openGraph: {
    title,
    description: site.description,
    type: "website",
    images: [
      {
        url: "/images/flowstate-hero-atmosphere.png",
        width: 1536,
        height: 1024,
        alt: "A calm martial arts training space used as the Flowstate landing page atmosphere.",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
