import type { WorkspaceRole } from "@/components/workspace/types";
import { connectedWorkspaceHref, WORKSPACE_VIEWS, type WorkspaceView } from "@/domain/workspace-routes";

export interface WorkspaceContext {
  view: WorkspaceView | null;
  projectId: string | null;
  scopeId: string | null;
  taskId: string | null;
  collectionView: WorkspaceView | null;
  collectionKey?: string;
}

const COLLECTION_VIEWS = ["overview", "sites", "queue", "pipeline", "portfolio"] as const;

export function isCollectionView(view: WorkspaceView) {
  return COLLECTION_VIEWS.some((candidate) => candidate === view);
}

export const ROLE_NAVIGATION: Record<WorkspaceRole, readonly { view: WorkspaceView; label: string }[]> = {
  "site-owner": [
    { view: "overview", label: "Overview" },
    { view: "sites", label: "Your sites" },
    { view: "documents", label: "Documents" },
    { view: "reports", label: "Reports" },
    { view: "activity", label: "Activity" },
    { view: "profile", label: "Profile" },
  ],
  operator: [
    { view: "queue", label: "Action Center" },
    { view: "pipeline", label: "Project pipeline" },
    { view: "documents", label: "Documents" },
    { view: "reports", label: "Reports" },
    { view: "activity", label: "Activity" },
    { view: "profile", label: "Profile" },
  ],
  investor: [
    { view: "portfolio", label: "Portfolio" },
    { view: "engagements", label: "Engagements" },
    { view: "documents", label: "Documents" },
    { view: "activity", label: "Activity" },
    { view: "mandate", label: "Mandate" },
    { view: "reports", label: "Reports" },
    { view: "profile", label: "Profile" },
  ],
};

export const COMMON_NAVIGATION = [
  { view: "help", label: "Learning & help" },
  { view: "connections", label: "Connections" },
] as const;

export function workspaceContext(href: string, historyState?: unknown): WorkspaceContext {
  const candidate = new URL(href, "https://sunsum.invalid");
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(candidate.searchParams.keys())) {
    const values = candidate.searchParams.getAll(key);
    const first = values[0];
    query[key] = values.length === 1 && first !== undefined ? first : values;
  }
  const safe = new URL(connectedWorkspaceHref(query), "https://sunsum.invalid");
  const view = safe.searchParams.get("view");
  const state = typeof historyState === "object" && historyState !== null ? historyState : null;
  const collectionKey = state && "sunsumCollectionState" in state &&
    typeof state.sunsumCollectionState === "string" && state.sunsumCollectionState.length <= 128
    ? state.sunsumCollectionState : null;
  return {
    view: WORKSPACE_VIEWS.find((allowed) => allowed === view) ?? null,
    projectId: safe.searchParams.get("project"),
    scopeId: safe.searchParams.get("scope"),
    taskId: safe.searchParams.get("task"),
    collectionView: typeof historyState === "object" && historyState !== null &&
      "sunsumCollectionView" in historyState
      ? COLLECTION_VIEWS.find((candidate) => candidate === historyState.sunsumCollectionView) ?? null : null,
    ...(collectionKey === null ? {} : { collectionKey }),
  };
}

export function permittedView(role: WorkspaceRole | null, requested: WorkspaceView | null): WorkspaceView {
  if (requested === "help" || requested === "welcome") return "help";
  if (requested === "connections" || requested === "roadmap") return "connections";
  if (!role) return "overview";
  const allowed = ROLE_NAVIGATION[role].find((item) => item.view === requested);
  if (allowed) return allowed.view;
  if (requested === "inbox") return role === "operator" ? "queue" : role === "site-owner" ? "activity" : "engagements";
  if (requested === "compare" || (requested === "intake" && role === "site-owner")) return requested;
  return role === "operator" ? "queue" : role === "investor" ? "portfolio" : "overview";
}

export function contextHref(context: WorkspaceContext): string {
  return connectedWorkspaceHref({
    view: context.view ?? undefined,
    project: context.projectId ?? undefined,
    scope: context.scopeId ?? undefined,
    task: context.taskId ?? undefined,
  });
}
