"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { cx } from "@/components/ui/cx";
import styles from "./DemoRoleSwitcher.module.css";

/**
 * The roles `/api/auth/demo-switch` will sign in as.
 *
 * Duplicated from the backend's `Role` rather than imported, because this is a
 * client component and importing from `@/backend` would pull server modules
 * into the browser bundle. The API rejects anything it does not recognise, so
 * the two lists disagreeing produces a refusal, not a wrong session.
 */
const ROLES = [
  {
    value: "site_owner",
    label: "Site owner",
    description: "Someone who submitted a property",
  },
  {
    value: "operator",
    label: "Operator",
    description: "Sunsum staff reviewing submissions",
  },
  {
    value: "investor",
    label: "Financier",
    description: "An investor reviewing the portfolio",
  },
] as const;

type RoleValue = (typeof ROLES)[number]["value"];

export interface DemoRoleSwitcherProps {
  /** The signed-in role, or `null` when nobody is signed in. */
  readonly activeRole?: string | null;
  readonly className?: string | undefined;
}

/**
 * Signs the browser in as one of the seeded demo accounts.
 *
 * This exists because every page in this app was previously unauthenticated:
 * the API issues a `Secure`, `HttpOnly` session cookie, but nothing in the
 * interface ever asked for one. A visitor therefore could not reach their own
 * data from a browser at all, and any page reading a session would always fall
 * back to sample content no matter what the database held.
 *
 * It is a demo sign-in and takes no credential, so it renders only where the
 * server has opted in through `SUNSUM_DEMO_AUTH`. That decision is made on the
 * server and expressed as whether this component is rendered at all, so a
 * deployment without demo auth does not ship the control and then fail on use.
 *
 * `router.refresh()` rather than `location.reload()`: the pages that read a
 * session are server components, and refresh re-runs them and re-renders in
 * place, keeping scroll position and any client state on the page.
 */
export function DemoRoleSwitcher({
  activeRole = null,
  className,
}: DemoRoleSwitcherProps) {
  const router = useRouter();
  const [pending, setPending] = useState<RoleValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signInAs(role: RoleValue) {
    setPending(role);
    setError(null);

    try {
      const response = await fetch("/api/auth/demo-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        // The body is this API's failure shape; fall back if it is not JSON.
        const failure: unknown = await response.json().catch(() => null);
        const message =
          typeof failure === "object" &&
          failure !== null &&
          typeof (failure as { message?: unknown }).message === "string"
            ? (failure as { message: string }).message
            : `Could not sign in as ${role} (HTTP ${response.status}).`;
        setError(message);
        return;
      }

      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-labelledby="demo-role-heading"
      className={cx(styles.panel, className)}
    >
      <div className={styles.heading}>
        <h2 className={styles.title} id="demo-role-heading">
          Demo sign-in
        </h2>
        <p className={styles.note}>
          Seeded accounts for the prototype. No password is required and no real
          credential is involved.
        </p>
      </div>

      <div className={styles.options}>
        {ROLES.map((role) => {
          const isActive = activeRole === role.value;

          return (
            <button
              aria-current={isActive ? "true" : undefined}
              className={cx(styles.option, isActive && styles.optionActive)}
              disabled={pending !== null}
              key={role.value}
              onClick={() => void signInAs(role.value)}
              type="button"
            >
              <span className={styles.optionLabel}>
                {role.label}
                {isActive ? (
                  <span className={styles.activeTag}>Signed in</span>
                ) : null}
              </span>
              <span className={styles.optionDescription}>
                {pending === role.value ? "Signing in…" : role.description}
              </span>
            </button>
          );
        })}
      </div>

      {error === null ? null : (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
