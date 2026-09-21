import type { ReactNode } from "react";
import { PublicShell } from "@/features/participation";

/**
 * The public chrome the dashboard routes carried while it lived in the root
 * layout. The root layout is now bare so the connected `/app` entry composes
 * its own shell, so the routes that still want the public header and footer
 * ask for it here.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
