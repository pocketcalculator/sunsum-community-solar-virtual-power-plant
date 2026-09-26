import type { Metadata } from "next";
import { connectedWorkspaceHref } from "@/domain/workspace-routes";
import { getWorkspaceConfiguration } from "./configuration";
import { WorkspaceEntry } from "./WorkspaceEntry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};

interface WorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  return <WorkspaceEntry configuration={getWorkspaceConfiguration()}
    initialHref={connectedWorkspaceHref(await searchParams)} />;
}
