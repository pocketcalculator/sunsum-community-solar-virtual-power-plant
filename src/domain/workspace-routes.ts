export const WORKSPACE_PATH = "/app";

export const WORKSPACE_VIEWS = [
  "overview", "profile", "reports", "sites", "intake", "compare", "inbox",
  "documents", "queue", "pipeline", "portfolio", "engagements", "mandate",
  "activity", "welcome", "roadmap", "help", "connections",
] as const;

export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

export function connectedWorkspaceHref(
  query: Record<string, string | string[] | undefined> = {},
): string {
  const params = new URLSearchParams();
  for (const key of ["view", "project", "scope", "task"]) {
    const value = query[key];
    if (typeof value !== "string" || value.length === 0 || value.length > 160 ||
      /[\u0000-\u001f\u007f]/.test(value)) continue;
    if (key === "view" && !WORKSPACE_VIEWS.some((view) => view === value)) continue;
    params.set(key, value);
  }
  const search = params.toString();
  return search ? `${WORKSPACE_PATH}?${search}` : WORKSPACE_PATH;
}
