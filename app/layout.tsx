import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeScript } from "@/components/ui/theme/ThemeScript";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sunsum - community solar",
    template: "%s · Sunsum",
  },
  description:
    "Explore community solar and read permitted project information. The separate interactive demo uses fictional data; connected workflow writes are not implemented.",
  applicationName: "Sunsum",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    // The theme script sets `data-theme` here before React runs, so this
    // element is expected to differ from what the server sent.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
