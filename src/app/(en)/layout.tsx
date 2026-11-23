import type { Metadata } from "next";
import { RootDocument } from "@/components/shell/RootDocument";
import { rootMetadata } from "@/lib/seo/root-metadata";

export const metadata: Metadata = rootMetadata();

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <RootDocument locale="en">{children}</RootDocument>;
}
