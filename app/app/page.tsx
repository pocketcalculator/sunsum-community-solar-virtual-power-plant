import type { Metadata } from "next";
import { resolveLiveReadConfiguration } from "@/domain/live-configuration";
import { connectedWorkspaceHref } from "@/domain/workspace-routes";
import { LiveWorkspace } from "@/features/live-workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};

interface WorkspacePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  // SUNSUM-CONNECTION:WS2-IDENTITY: only safe evidence flags cross into the client.
  const configuration = resolveLiveReadConfiguration({
    dataMode: process.env.SUNSUM_PUBLIC_DATA_MODE,
    apiBase: process.env.SUNSUM_PUBLIC_API_BASE_URL,
    store: process.env.SUNSUM_STORE,
    demoAuth: process.env.SUNSUM_DEMO_AUTH,
    sessionSecretConfigured: Boolean(process.env.SUNSUM_SESSION_SECRET),
    participantSignInApproved: process.env.SUNSUM_LIVE_READ_AUTH_APPROVED === "true",
    exportApproved: process.env.SUNSUM_LIVE_EXPORT_APPROVED === "true",
    documentDownloadsApproved: process.env.SUNSUM_LIVE_DOCUMENTS_APPROVED === "true",
  });
  return <LiveWorkspace configuration={configuration}
    initialHref={connectedWorkspaceHref(await searchParams)} />;
}
