export type WorkspaceRole = "site-owner" | "operator" | "investor";
export type WorkspaceMode = "demo" | "live" | "server-demo";

export interface RoleControlProps {
  value: WorkspaceRole | null;
  allowedRoles: readonly WorkspaceRole[];
  mode: WorkspaceMode;
  onChange: (role: WorkspaceRole) => void;
  variant?: "panel" | "pill";
  className?: string | undefined;
  disabled?: boolean;
  pendingRole?: WorkspaceRole | null;
  error?: string | null;
}

/** A permitted display projection, not a service record or synthetic Site. */
export interface ProjectReadRow {
  id: string;
  title: string;
  subtitle: string;
  stage: string;
  capacity: string;
  screening: string;
  screeningTone?: "neutral" | "positive" | "warning" | "danger";
}

export interface CollectionResultsProps {
  rows: readonly ProjectReadRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  display: "list" | "cards";
  label: string;
}
