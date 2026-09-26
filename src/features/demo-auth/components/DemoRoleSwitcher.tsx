"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

import { cx } from "@/components/ui/cx";
import {
  BanknotesIcon,
  HardHatIcon,
  HouseIcon,
  type IconProps,
} from "@/components/ui/icons";
import styles from "./DemoRoleSwitcher.module.css";

/**
 * The roles `/api/auth/demo-switch` will sign in as.
 *
 * Duplicated from the backend's `Role` rather than imported, because this is a
 * client component and importing from `@/backend` would pull server modules
 * into the browser bundle. The API rejects anything it does not recognise, so
 * the two lists disagreeing produces a refusal, not a wrong session.
 *
 * The icon is decorative — the role's name is always rendered beside it, so a
 * house, a hard hat and a stack of notes never have to carry the meaning on
 * their own.
 */
const ROLES = [
  {
    value: "site_owner",
    label: "Site owner",
    description: "Someone who submitted a property",
    Icon: HouseIcon,
  },
  {
    value: "operator",
    label: "Operator",
    description: "Sunsum staff reviewing submissions",
    Icon: HardHatIcon,
  },
  {
    value: "investor",
    label: "Financier",
    description: "An investor reviewing the portfolio",
    Icon: BanknotesIcon,
  },
] as const satisfies readonly {
  value: string;
  label: string;
  description: string;
  Icon: (props: IconProps) => React.JSX.Element;
}[];

type RoleValue = (typeof ROLES)[number]["value"];

/**
 * `panel` is the original full-width card, kept as the default so the site
 * owner dashboard renders exactly as before. `pill` is the compact form for
 * the global header, where there is no room for headings or descriptions.
 */
export type DemoRoleSwitcherVariant = "panel" | "pill";

export interface DemoRoleSwitcherProps {
  /** The signed-in role, or `null` when nobody is signed in. */
  readonly activeRole?: string | null;
  readonly className?: string | undefined;
  readonly variant?: DemoRoleSwitcherVariant;
  /**
   * Ask `/api/me` which role this browser holds instead of being told.
   *
   * The header renders on every route including the landing page, which is
   * static. Reading `cookies()` in the root layout to pass `activeRole` down
   * would opt every route into dynamic rendering to decorate one control, so
   * the header instance resolves its own role after mount and the pages that
   * already read a session keep passing theirs in.
   */
  readonly resolveOwnRole?: boolean;
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
  variant = "panel",
  resolveOwnRole = false,
}: DemoRoleSwitcherProps) {
  const router = useRouter();
  const [pending, setPending] = useState<RoleValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * What this control has learned since it mounted — from `/api/me`, or from a
   * sign-in it just performed. `null` means it has learned nothing and the
   * caller's `activeRole` stands, which keeps the prop authoritative for the
   * pages that read the session on the server.
   */
  const [discoveredRole, setDiscoveredRole] = useState<string | null>(null);
  const signedInRole = discoveredRole ?? activeRole;

  useEffect(() => {
    if (!resolveOwnRole) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/me", {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;

        const identity: unknown = await response.json();
        const role =
          typeof identity === "object" && identity !== null
            ? (identity as { role?: unknown }).role
            : null;
        if (typeof role === "string") setDiscoveredRole(role);
      } catch {
        // Nobody signed in is the ordinary case here, not a fault to report.
        // The control still works: it is how you sign in.
      }
    })();

    return () => controller.abort();
  }, [resolveOwnRole]);

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

      /**
       * Set locally as well as refreshing: `router.refresh()` re-runs server
       * components, but this control's own marking is client state that a
       * refresh does not reach when the role was never passed in as a prop.
       */
      setDiscoveredRole(role);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setPending(null);
    }
  }

  if (variant === "pill") {
    /**
     * The indicator slides between options rather than each option colouring
     * itself, which is what makes the change read as one control moving. Its
     * position is a custom property so the animation stays in CSS, where
     * `prefers-reduced-motion` can switch it off.
     *
     * `-1` parks it off-stage: nobody is signed in yet, and sliding out from
     * an arbitrary role would assert a session that does not exist.
     */
    const activeIndex = ROLES.findIndex((role) => role.value === signedInRole);
    const indicator: CSSProperties & {
      "--pill-index": number;
      "--pill-count": number;
    } = {
      "--pill-index": activeIndex,
      "--pill-count": ROLES.length,
    };

    return (
      <div
        aria-label="Demo sign-in. Seeded prototype accounts; no password and no real credential."
        className={cx(styles.pillGroup, className)}
        role="group"
      >
        <span className={styles.pillCaption}>Demo as</span>
        <div className={styles.pillOptions} style={indicator}>
          {activeIndex < 0 ? null : (
            <span aria-hidden="true" className={styles.pillIndicator} />
          )}
          {ROLES.map((role) => {
            const isActive = signedInRole === role.value;

            return (
              <button
                aria-current={isActive ? "true" : undefined}
                className={cx(styles.pill, isActive && styles.pillActive)}
                disabled={pending !== null}
                key={role.value}
                onClick={() => void signInAs(role.value)}
                title={role.description}
                type="button"
              >
                <role.Icon className={styles.pillIcon} />
                <span>
                  {pending === role.value ? "Signing in…" : role.label}
                </span>
              </button>
            );
          })}
        </div>

        {error === null ? null : (
          <p className={styles.pillError} role="alert">
            {error}
          </p>
        )}
      </div>
    );
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
          const isActive = signedInRole === role.value;

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
