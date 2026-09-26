import type { ReactNode } from "react";
import type { WorkspaceRole } from "./types";

export interface WorkspaceRoleControlBinding {
  readonly role: WorkspaceRole | null;
  readonly disabled: boolean;
  readonly onSwitchStart: () => void;
  readonly onSwitchSettled: () => void;
}

export type WorkspaceRoleControlRenderer = (
  binding: WorkspaceRoleControlBinding,
) => ReactNode;
