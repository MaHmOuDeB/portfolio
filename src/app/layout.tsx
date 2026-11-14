import type { Metadata } from "next";
import { canonicalOrigin } from "@/lib/seo/metadata";
import { OG_HEIGHT, OG_WIDTH, ogAlt } from "@/lib/seo/og-template";
import { SITE } from "@/lib/site";
import { ogCard } from "../../content/seo";
import { Footer } from "@/components/shell/Footer";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Lean } from "@/components/depth/Lean";
import { RegionFocus } from "@/components/shell/RegionFocus";
import { SkipLink } from "@/components/shell/SkipLink";
import { inter } from "./fonts";
import "./globals.css";

// The defaults every page starts from. canonicalOrigin() runs at build time and fails a production
// build that cannot name its canonical origin. There is no canonical here: each public page sets its
// own (content/seo.ts), and a page without one (the 404 page, /exclude) has none.
const origin = canonicalOrigin();
const siteImage = { url: new URL("/og/site.png", origin).href, alt: ogAlt(ogCard("site")) };

export const metadata: Metadata = {
  metadataBase: origin,
  title: SITE.name,
  description: "Experimentation and growth analyst in Berlin.",
  openGraph: {
    type: "website",
    siteName: SITE.name,
    images: [{ ...siteImage, width: OG_WIDTH, height: OG_HEIGHT, type: "image/png" }],
  },
  twitter: { card: "summary_large_image", images: [siteImage] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.setAttribute('data-js','')",
          }}
        />
      </head>
      <body className="flex min-h-svh flex-col bg-bg font-sans text-base text-ink">
        <SkipLink />
        <SiteHeader />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-page flex-1 px-4 md:px-8">
          {children}
        </main>
        <Footer />
        <RegionFocus />
        <Lean />
      </body>
    </html>
  );
}
