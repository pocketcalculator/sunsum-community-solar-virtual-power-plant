"use client";

import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { BanknotesIcon, HardHatIcon, HouseIcon } from "@/components/ui/icons";
import type { RoleControlProps, WorkspaceRole } from "./types";
import s from "./RoleControl.module.css";

const ROLES = [
  { value: "site-owner", label: "Site owner", description: "Someone who submitted a property", Icon: HouseIcon },
  { value: "operator", label: "Operator", description: "Sunsum staff reviewing submissions", Icon: HardHatIcon },
  { value: "investor", label: "Investor", description: "An investor reviewing the portfolio", Icon: BanknotesIcon },
] as const;

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  epoch: number;
  origin: number;
  pitch: number;
}

interface Motion {
  context: string;
  epoch: number;
  anchor: number;
  position: number | null;
  target: WorkspaceRole | null;
}

const clampPosition = (position: number) => Math.max(0, Math.min(ROLES.length - 1, position));

export function RoleControl({
  value, allowedRoles, mode, onChange, variant = "pill", className,
  disabled = false, pendingRole = null, error = null,
}: RoleControlProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClickUntil = useRef(0);
  const cancelledClick = useRef(false);
  const busy = disabled || pendingRole !== null;
  const session = mode === "server-demo";
  const allowed = ROLES.filter((role) => allowedRoles.includes(role.value));
  const index = ROLES.findIndex((role) => role.value === value && allowedRoles.includes(role.value));
  const context = `${mode}:${variant}:${value ?? "unknown"}:${busy}:${allowed.map((role) => role.value).join(",")}`;
  const [motion, setMotion] = useState<Motion>(() => ({
    context, epoch: 0, anchor: Math.max(0, index), position: null, target: null,
  }));
  if (motion.context !== context) {
    // Retire gestures on authority changes, including a disable/re-enable with the same role.
    setMotion({
      context, epoch: motion.epoch + 1, anchor: index >= 0 ? index : motion.anchor,
      position: null, target: null,
    });
  }
  const dragging = motion.context === context && !busy && motion.position !== null;
  const preview = dragging ? motion.target : null;
  const indicator: CSSProperties & { "--role-index": number } = {
    "--role-index": dragging ? motion.position ?? motion.anchor : index >= 0 ? index : motion.anchor,
  };

  const choose = (role: WorkspaceRole) => {
    if (!busy && allowedRoles.includes(role) && (session || role !== value)) onChange(role);
  };
  const focus = (role: WorkspaceRole) => {
    root.current?.querySelector<HTMLElement>(`[data-role-control="${role}"]`)?.focus();
  };
  const atPointer = (event: PointerEvent<HTMLDivElement>): WorkspaceRole | null => {
    if (busy) return null;
    for (const role of allowed) {
      const bounds = root.current?.querySelector<HTMLElement>(`[data-role="${role.value}"]`)?.getBoundingClientRect();
      if (bounds && event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom) return role.value;
    }
    return null;
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>, role: WorkspaceRole) => {
    if (busy || !allowedRoles.includes(role) || !allowed.length ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = allowed.findIndex((item) => item.value === role);
    const next = event.key === "Home" ? 0 : event.key === "End" ? allowed.length - 1 :
      (current + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + allowed.length) % allowed.length;
    const target = allowed[next];
    if (target) { choose(target.value); focus(target.value); }
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setMotion((previous) => previous.epoch === current.epoch
      ? { ...previous, position: null, target: null } : previous);
    if (current.moved) {
      suppressClickUntil.current = event.timeStamp + 100;
      const target = cancelled || current.epoch !== motion.epoch ? null : atPointer(event);
      if (target) { choose(target); focus(target); }
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const hint = session ? "Seeded developer/demo accounts, not verified participant identities." :
    mode === "live" ? "Existing server grants only. This control cannot grant a role." : "Fictional perspectives only.";

  return <fieldset className={`${s.group} ${className ?? ""}`} data-variant={variant}
    aria-describedby={`${id}-hint`} aria-busy={pendingRole !== null}>
    <legend>{session ? "Developer/demo sign-in" : mode === "demo" ? "Demo role" : "Workspace role"}</legend>
    <div className={s.segments} ref={root} style={indicator} data-role-hit-track data-dragging={dragging}
      onPointerDown={(event) => {
        if (drag.current && drag.current.epoch !== motion.epoch) {
          const stale = drag.current.pointerId;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture?.(stale)) event.currentTarget.releasePointerCapture(stale);
        }
        const target = atPointer(event);
        if (drag.current || event.button !== 0 || !target || allowed.length < 2) return;
        const first = root.current?.querySelector<HTMLElement>('[data-role="site-owner"]')?.getBoundingClientRect();
        const second = root.current?.querySelector<HTMLElement>('[data-role="operator"]')?.getBoundingClientRect();
        const painted = highlight.current?.getBoundingClientRect();
        const pitch = first && second && second.left > first.left ? second.left - first.left : 1;
        let origin = ROLES.findIndex((role) => role.value === target);
        if (index >= 0 && painted && first && painted.width > 0 &&
          event.clientX >= painted.left && event.clientX <= painted.right) {
          origin = clampPosition((painted.left - first.left) / pitch);
        }
        cancelledClick.current = false;
        drag.current = {
          pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
          epoch: motion.epoch, origin, pitch,
        };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (busy || current.epoch !== motion.epoch) { finish(event, true); return; }
        if (!current.moved && Math.abs(event.clientX - current.x) > 6 &&
          Math.abs(event.clientX - current.x) > Math.abs(event.clientY - current.y)) {
          current.moved = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }
        if (current.moved) {
          const position = clampPosition(current.origin + (event.clientX - current.x) / current.pitch);
          const target = atPointer(event);
          setMotion((previous) => previous.epoch === current.epoch ? { ...previous, position, target } : previous);
        }
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !drag.current) return;
        const pointerId = drag.current.pointerId;
        cancelledClick.current = true;
        drag.current = null;
        setMotion((previous) => ({ ...previous, position: null, target: null }));
        if (event.currentTarget.hasPointerCapture?.(pointerId)) event.currentTarget.releasePointerCapture(pointerId);
      }}
      onClickCapture={(event) => {
        if (event.detail > 0 && (cancelledClick.current || event.timeStamp <= suppressClickUntil.current)) {
          cancelledClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}>
      {variant === "pill" && <span className={s.track} data-role-visual-track aria-hidden="true" />}
      {variant === "pill" && <span ref={highlight} className={s.indicator} data-role-indicator
        data-role-state={dragging ? "preview" : index >= 0 ? "confirmed" : "hidden"} aria-hidden="true" />}
      {ROLES.map((role) => {
        const unavailable = !allowedRoles.includes(role.value);
        const selected = !unavailable && value === role.value;
        const label = session && role.value === "investor" ? "Financier" : role.label;
        const content = <>
          <role.Icon className={s.icon} />
          <span>{pendingRole === role.value ? "Signing in..." : label}</span>
          {variant === "panel" && <small className={s.description}>{role.description}</small>}
        </>;
        return session ? <button key={role.value} type="button" className={s.segment}
          data-role={role.value} data-role-control={role.value} data-selected={selected}
          data-preview={!busy && preview === role.value} data-disabled={unavailable}
          title={busy ? "Switching is unavailable while the session or workspace updates." : role.description}
          disabled={busy || unavailable} aria-current={selected ? "true" : undefined}
          onClick={() => choose(role.value)} onKeyDown={(event) => keyboard(event, role.value)}>
          {content}
        </button> : <label key={role.value} data-role={role.value} className={s.segment}
          title={unavailable ? `${role.label}: ${mode === "live" ? "not granted by your server session" : "unavailable"}.` : role.label}
          data-selected={selected} data-preview={!busy && preview === role.value} data-disabled={unavailable}>
          <input type="radio" name={`${id}-role`} value={role.value} data-role-control={role.value}
            checked={selected} disabled={busy || unavailable}
            aria-label={role.label}
            aria-describedby={unavailable ? `${id}-${role.value}-unavailable` : undefined}
            onChange={() => choose(role.value)} onKeyDown={(event) => keyboard(event, role.value)} />
          <span>{role.label}</span>
          {unavailable && variant === "pill" && <svg className={s.lock} width="10" height="12"
            viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="1" y="6" width="10" height="7" rx="2" /><path d="M3 6V4a3 3 0 0 1 6 0v2" />
          </svg>}
          {unavailable && <small id={`${id}-${role.value}-unavailable`} className={s.unavailable}>
            {mode === "live" ? "Not granted" : "Unavailable"}
          </small>}
        </label>;
      })}
    </div>
    <p id={`${id}-hint`} className={s.hint}>{hint} {busy
      ? "Switching is unavailable while the session or workspace updates."
      : "Click, use arrow keys or drag and release. A drag preview does not grant a role."}</p>
    {error && <p className={s.error} role="alert">{error}</p>}
  </fieldset>;
}
