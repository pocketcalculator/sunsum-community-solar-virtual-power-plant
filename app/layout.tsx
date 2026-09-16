import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeScript } from "@/components/ui/theme/ThemeScript";
import { Assistant } from "@/features/assistant";
import {
  ENTRY_PATHS,
  PublicShell,
  entryPathHref,
} from "@/features/participation";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sunsum - public community solar preview",
    template: "%s · Sunsum",
  },
  description:
    "A public interface foundation for Sunsum's planned community solar workspaces. No live project data, accounts, or connected services.",
  applicationName: "Sunsum",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const assistantOptions = ENTRY_PATHS.map((path) => ({
    href: entryPathHref(path),
    label: path.label,
  }));

  return (
    // The theme script sets `data-theme` here before React runs, so this
    // element is expected to differ from what the server sent.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <PublicShell headerAction={<Assistant options={assistantOptions} />}>
          {children}
        </PublicShell>
      </body>
    </html>
  );
}
