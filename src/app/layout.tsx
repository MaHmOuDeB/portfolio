import type { Metadata } from "next";
import { Footer } from "@/components/shell/Footer";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { SkipLink } from "@/components/shell/SkipLink";
import { inter } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mahmoud El Bergui",
  description: "Experimentation and growth analyst in Berlin.",
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
      </body>
    </html>
  );
}
