import type { ReactNode } from 'react';
import { inter } from '@/app/fonts';
import { Lean } from '@/components/depth/Lean';
import { Footer } from '@/components/shell/Footer';
import { RegionFocus } from '@/components/shell/RegionFocus';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { SkipLink } from '@/components/shell/SkipLink';
import type { Locale } from '@/lib/i18n/locale';
import '@/app/globals.css';

// The one document every root layout renders: the language, the script that marks a page with
// JavaScript, the shell around the page and the parts that act on it.
export function RootDocument({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      {/* The App Router's root document: this head is the page's own, not a Pages Router head. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
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
        <main id="main" tabIndex={-1} data-frame="" className="mx-auto w-full max-w-page flex-1 px-4 md:px-8">
          {children}
        </main>
        <Footer />
        <RegionFocus />
        <Lean />
      </body>
    </html>
  );
}
