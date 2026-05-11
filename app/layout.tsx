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

const SITE = "https://git.clintphillips.dev";
const TITLE = "Learn Git & GitHub by doing — worktree";
const DESCRIPTION =
  "An interactive Git sandbox in your browser. Type real git commands and watch the commit graph move — branch, merge, undo, reflog, push. A guided 7-chapter manual plus a free-play mode. Nothing touches a real repo, so there's nothing to lose.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "worktree",
  authors: [{ name: "Clint Phillips", url: "https://clintphillips.dev" }],
  creator: "Clint Phillips",
  keywords: [
    "learn git",
    "git tutorial",
    "interactive git",
    "git sandbox",
    "learn github",
    "git branching",
    "git for beginners",
    "git commit graph",
    "git reflog",
    "git merge tutorial",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "worktree",
    title: TITLE,
    description: "Type real git commands in a safe in-browser sandbox and watch the commit graph move. Branch, merge, undo, push — there's nothing to lose.",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "Type real git commands in a safe in-browser sandbox and watch the commit graph move. Branch, merge, undo, push — there's nothing to lose.",
  },
  category: "education",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "worktree",
  alternateName: "worktree — a hands-on git manual",
  url: SITE,
  description: DESCRIPTION,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web browser",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Person", name: "Clint Phillips", url: "https://clintphillips.dev" },
  inLanguage: "en",
  keywords: "learn git, interactive git tutorial, git sandbox, git branching, git for beginners",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${hanken.variable} ${plexMono.variable} h-full`}>
      <body className="grain min-h-full">
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
