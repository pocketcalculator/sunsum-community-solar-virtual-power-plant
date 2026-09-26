import type { ReactNode } from "react";
import { Assistant } from "@/features/assistant";
import { ENTRY_PATHS, PublicShell, entryPathHref } from "@/features/participation";

export default function PublicLayout({ children }: { children: ReactNode }) {
  const options = ENTRY_PATHS.map((path) => ({
    href: entryPathHref(path),
    label: path.label,
  }));
  return <PublicShell headerAction={<Assistant options={options} />}>{children}</PublicShell>;
}
