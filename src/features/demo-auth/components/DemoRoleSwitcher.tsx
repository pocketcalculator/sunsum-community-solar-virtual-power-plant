"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RoleControl, type WorkspaceRole } from "@/components/workspace";

export type DemoRoleSwitcherVariant = "panel" | "pill";

export interface DemoRoleSwitcherProps {
  readonly activeRole?: string | null;
  readonly className?: string | undefined;
  readonly variant?: DemoRoleSwitcherVariant;
  readonly resolveOwnRole?: boolean;
  readonly disabled?: boolean;
  readonly onSwitchStart?: () => void;
  readonly onSwitchSettled?: () => void;
}

const WIRE_ROLES: Record<WorkspaceRole, string> = {
  "site-owner": "site_owner", operator: "operator", investor: "investor",
};
const ROLES: readonly WorkspaceRole[] = ["site-owner", "operator", "investor"];

interface IdentityObservation {
  generation: number;
  signal: AbortSignal;
  timedOut: boolean;
  role: WorkspaceRole | null;
  error: string | null;
}

function readRole(value: unknown): WorkspaceRole | null {
  return value === "site_owner" ? "site-owner" :
    value === "operator" || value === "investor" ? value : null;
}

/** Session adapter only. The server composition admits this developer/demo control. */
export function DemoRoleSwitcher({
  activeRole, className, variant = "panel", resolveOwnRole = false, disabled = false,
  onSwitchStart, onSwitchSettled,
}: DemoRoleSwitcherProps) {
  const router = useRouter();
  const controlled = activeRole !== undefined;
  const [discoveredRole, setDiscoveredRole] = useState<WorkspaceRole | null>(null);
  const [pending, setPending] = useState<WorkspaceRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const identityRequest = useRef<AbortController | null>(null);
  const identityGeneration = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      identityGeneration.current += 1;
      identityRequest.current?.abort();
    };
  }, []);

  const requestIdentity = useCallback(async (): Promise<IdentityObservation | null> => {
    identityRequest.current?.abort();
    const controller = new AbortController();
    identityRequest.current = controller;
    const generation = ++identityGeneration.current;
    const current = () => mounted.current && generation === identityGeneration.current;
    let timedOut = false;
    const observed = (role: WorkspaceRole | null, error: string | null): IdentityObservation => ({
      generation, signal: controller.signal, timedOut, role, error,
    });
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
    try {
      const response = await fetch("/api/me", {
        signal: controller.signal, headers: { accept: "application/json" }, cache: "no-store",
      });
      if (!current()) return null;
      controller.signal.throwIfAborted();
      if (response.status === 401) return observed(null, null);
      if (!response.ok) {
        return observed(null, `Could not confirm the demo session (HTTP ${response.status}). Refresh before continuing.`);
      }
      const identity: unknown = await response.json();
      if (!current()) return null;
      controller.signal.throwIfAborted();
      const role = typeof identity === "object" && identity !== null && "role" in identity
        ? readRole(identity.role) : null;
      return observed(role, role ? null : "The server did not confirm a recognized demo role. Refresh before continuing.");
    } catch {
      if (!current() || (controller.signal.aborted && !timedOut)) return null;
      return observed(null, "Could not confirm the demo session. Check your connection and refresh.");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const publishIdentity = useCallback((observation: IdentityObservation | null) => {
    if (!observation || !mounted.current || observation.generation !== identityGeneration.current ||
      (observation.signal.aborted && !observation.timedOut)) return;
    setDiscoveredRole(observation.role);
    if (observation.error) setError(observation.error);
  }, []);

  useEffect(() => {
    if (resolveOwnRole && !controlled) void requestIdentity().then(publishIdentity);
    return () => {
      identityGeneration.current += 1;
      identityRequest.current?.abort();
    };
  }, [resolveOwnRole, controlled, requestIdentity, publishIdentity]);

  async function signInAs(role: WorkspaceRole) {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    identityGeneration.current++;
    identityRequest.current?.abort();
    setDiscoveredRole(null);
    setPending(role);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      onSwitchStart?.();
      let response: Response;
      try {
        response = await fetch("/api/auth/demo-switch", {
          method: "POST", signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: WIRE_ROLES[role] }),
        });
      } catch {
        if (mounted.current) setError("Could not reach the server. The demo session may have changed; refresh before continuing.");
        return;
      }
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        if (mounted.current) setError(
          typeof failure === "object" && failure !== null && "message" in failure &&
            typeof failure.message === "string" && failure.message.trim()
            ? failure.message : `Could not sign in as ${WIRE_ROLES[role]} (HTTP ${response.status}).`,
        );
        return;
      }
      if (mounted.current) {
        router.refresh();
        if (!controlled) await requestIdentity().then(publishIdentity);
      }
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = false;
      if (mounted.current) setPending(null);
      onSwitchSettled?.();
    }
  }

  return <RoleControl value={controlled ? readRole(activeRole) : discoveredRole}
    allowedRoles={ROLES} mode="server-demo" variant={variant} className={className}
    disabled={disabled} pendingRole={pending} error={error}
    onChange={(role) => { void signInAs(role); }} />;
}
