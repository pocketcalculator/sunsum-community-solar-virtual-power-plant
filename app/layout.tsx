import type { Metadata } from "next";
import type { ReactNode } from "react";
import { isDemoAuthEnabled } from "@/backend";
import { ThemeScript } from "@/components/ui/theme/ThemeScript";
import { Assistant } from "@/features/assistant";
import { DemoRoleSwitcher } from "@/features/demo-auth";
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

/**
 * Rendered per request rather than prerendered.
 *
 * The header carries the demo sign-in control, and whether that control exists
 * at all is `SUNSUM_DEMO_AUTH` — a runtime App Service setting, not a build
 * argument. A prerendered shell bakes in whatever the value was during `next
 * build`, which is unset, so the control would be missing from every static
 * page no matter how the deployment was configured. It is also the wrong shape
 * of thing to prerender: the header reflects who is signed in, which is a
 * per-request question.
 *
 * This costs the static rendering of the public pages. That is the right
 * trade: those pages still render server-side on every request, and a header
 * that silently disagrees with the deployment is a defect rather than an
 * optimisation.
 */
export const dynamic = "force-dynamic";

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
        <PublicShell
          headerAction={<Assistant options={assistantOptions} />}
          demoControl={
            /**
             * `isDemoAuthEnabled` reads an environment variable rather than a
             * request, so asking here does not opt any route into dynamic
             * rendering. The control resolves which role is signed in itself,
             * which is what keeps the static pages static.
             */
            isDemoAuthEnabled() ? (
              <DemoRoleSwitcher resolveOwnRole variant="pill" />
            ) : null
          }
        >
          {children}
        </PublicShell>
      </body>
    </html>
  );
}
