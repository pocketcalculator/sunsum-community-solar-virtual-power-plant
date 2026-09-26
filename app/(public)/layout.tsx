import type { ReactNode } from "react";
import { Assistant } from "@/features/assistant";
import { DemoRoleSwitcher } from "@/features/demo-auth";
import { ENTRY_PATHS, PageAudioProvider, PublicShell, entryPathHref } from "@/features/participation";
import { getWorkspaceConfiguration } from "../app/configuration";

// Runtime server-demo admission must not be baked into a default-mode build.
export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: ReactNode }) {
  const configuration = getWorkspaceConfiguration();
  const options = ENTRY_PATHS.map((path) => ({
    href: entryPathHref(path),
    label: path.label,
  }));
  return <PageAudioProvider>
    <PublicShell headerAction={<Assistant options={options} />}
      demoControl={configuration.mode === "server-demo"
        ? <DemoRoleSwitcher resolveOwnRole variant="pill" /> : null}>
      {children}
    </PublicShell>
  </PageAudioProvider>;
}
