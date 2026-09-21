"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { RoleControlProps, WorkspaceRole } from "./types";
import s from "./RoleControl.module.css";

const ROLES = [
  { value: "site-owner", label: "Site owner" },
  { value: "operator", label: "Operator" },
  { value: "investor", label: "Investor" },
] as const;

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
}

export function RoleControl({ value, allowedRoles, mode, onChange }: RoleControlProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClickUntil = useRef(0);
  const [preview, setPreview] = useState<WorkspaceRole | null>(null);
  const allowed = ROLES.filter((role) => allowedRoles.includes(role.value));

  const choose = (role: WorkspaceRole) => {
    if (allowedRoles.includes(role) && role !== value) onChange(role);
  };
  const focus = (role: WorkspaceRole) => {
    root.current?.querySelector<HTMLInputElement>(`input[value="${role}"]`)?.focus();
  };
  const atPointer = (event: PointerEvent<HTMLDivElement>): WorkspaceRole | null => {
    for (const role of allowed) {
      const bounds = root.current?.querySelector<HTMLElement>(`[data-role="${role.value}"]`)?.getBoundingClientRect();
      if (bounds && event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom) return role.value;
    }
    return null;
  };
  const keyboard = (event: KeyboardEvent<HTMLInputElement>, role: WorkspaceRole) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || !allowed.length) return;
    event.preventDefault();
    const index = allowed.findIndex((item) => item.value === role);
    const next = event.key === "Home" ? 0 : event.key === "End" ? allowed.length - 1 :
      (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + allowed.length) % allowed.length;
    const target = allowed[next];
    if (target) { choose(target.value); focus(target.value); }
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
    if (current.moved) {
      suppressClickUntil.current = event.timeStamp + 100;
      const target = cancelled ? null : atPointer(event);
      if (target) { choose(target); focus(target); }
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <fieldset className={s.group} aria-describedby={`${id}-hint`}>
    <legend>{mode === "demo" ? "Demo role" : "Workspace role"}</legend>
    <div
      className={s.segments}
      ref={root}
      onPointerDown={(event) => {
        if (drag.current || event.button !== 0 || !atPointer(event)) return;
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (!current.moved && Math.abs(event.clientX - current.x) > 6 &&
          Math.abs(event.clientX - current.x) > Math.abs(event.clientY - current.y)) {
          current.moved = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }
        if (current.moved) setPreview(atPointer(event));
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onClickCapture={(event) => {
        if (event.detail > 0 && event.timeStamp <= suppressClickUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {ROLES.map((role) => {
        const disabled = !allowedRoles.includes(role.value);
        return <label key={role.value} data-role={role.value} className={s.segment}
          data-selected={!disabled && value === role.value} data-preview={preview === role.value}
          data-disabled={disabled}>
          <input type="radio" name={`${id}-role`} value={role.value}
            checked={!disabled && value === role.value} disabled={disabled}
            aria-describedby={disabled ? `${id}-${role.value}-unavailable` : undefined}
            onChange={() => choose(role.value)} onKeyDown={(event) => keyboard(event, role.value)} />
          <span>{role.label}</span>
            {mode === "live" ? "Not granted" : "Unavailable"}
          </small>}
        </label>;
      })}
    </div>
    <p id={`${id}-hint`} className={s.hint}>Click, use arrow keys or drag. {mode === "live" ? "Existing grants only." : "Fictional perspectives only."}</p>
  </fieldset>;
}
