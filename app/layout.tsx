import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "worktree — learn git & github by doing",
  description: "A hands-on git manual: type real git commands in a safe in-browser sandbox and watch the commit graph move. Branch, merge, undo, push — break whatever you want.",
  authors: [{ name: "Clint Phillips" }],
  openGraph: {
    title: "worktree — learn git & github by doing",
    description: "Type real git commands in a safe sandbox and watch the commit graph move. Branch, merge, undo, push — there's nothing to lose.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${hanken.variable} ${plexMono.variable} h-full`}>
      <body className="grain min-h-full">{children}</body>
    </html>
  );
}
