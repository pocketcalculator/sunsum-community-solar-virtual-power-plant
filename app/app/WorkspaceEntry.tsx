"use client";

import type { WorkspaceConfiguration } from "@/domain/live-configuration";
import type { WorkspaceRoleControlRenderer } from "@/components/workspace/sessionControl";
import { DemoRoleSwitcher } from "@/features/demo-auth";
import { LiveWorkspace } from "@/features/live-workspace";

const renderDemoRoleControl: WorkspaceRoleControlRenderer = ({
  role, disabled, onSwitchStart, onSwitchSettled,
}) => <DemoRoleSwitcher variant="pill"
  activeRole={role === "site-owner" ? "site_owner" : role}
  disabled={disabled} onSwitchStart={onSwitchStart} onSwitchSettled={onSwitchSettled} />;

export function WorkspaceEntry({ configuration, initialHref }: {
  configuration: WorkspaceConfiguration;
  initialHref: string;
}) {
  return configuration.mode === "server-demo"
    ? <LiveWorkspace configuration={configuration} initialHref={initialHref} renderRoleControl={renderDemoRoleControl} />
    : <LiveWorkspace configuration={configuration} initialHref={initialHref} />;
}
