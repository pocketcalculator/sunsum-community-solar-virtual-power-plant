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
    "Explore community solar and your permitted workspace. Service actions require authorized access; the separate synthetic demo uses fictional browser-local data.",
  applicationName: "Sunsum",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><ThemeScript /></head>
      <body>{children}</body>
    </html>
  );
}
