import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PublicShell } from "@/features/participation";
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
  return (
    <html lang="en">
      <body>
        <PublicShell>{children}</PublicShell>
      </body>
    </html>
  );
}
