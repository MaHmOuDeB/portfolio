import type { Metadata } from "next";
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
      <body className="bg-bg font-sans text-base text-ink">
        <SkipLink />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
