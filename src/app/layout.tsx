import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mahmoud El Bergui",
  description: "Experimentation and growth analyst in Berlin.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
