"use client";

import { useState } from "react";

import { cx } from "@/components/ui/cx";
import styles from "./InterestButton.module.css";

/**
 * Every outcome `POST /projects/{id}/engagements` can produce, as a state this
 * control can be in. Derived from the handler and `expressInterest`:
 *
 *   201 created        the engagement exists now
 *   409 conflict       a live engagement already exists
 *   403 forbidden_tier onboarding is not complete
 *   403 forbidden_role the session is not an investor
 *   401 unauthenticated nobody is signed in
 *   404 not_found      the project is not visible to investors
 *
 * They are distinguished rather than collapsed into "something went wrong"
 * because the useful next step differs for each, and two of them are ordinary
 * states rather than faults.
 */
type InterestState =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "engaged" }
  | { readonly kind: "needs_onboarding"; readonly message: string }
  | { readonly kind: "needs_sign_in"; readonly message: string }
  | { readonly kind: "refused"; readonly message: string };

export interface InterestButtonProps {
  readonly projectId: string;
  readonly projectName: string;
  /** Whether a live engagement already exists, from `GET /me/engagements`. */
  readonly alreadyEngaged?: boolean;
  /** Told when an engagement is created, so the page can keep a running count. */
  readonly onEngaged?: (projectId: string) => void;
  readonly className?: string | undefined;
}

function messageFrom(failure: unknown, fallback: string): string {
  return typeof failure === "object" &&
    failure !== null &&
    typeof (failure as { message?: unknown }).message === "string"
    ? (failure as { message: string }).message
    : fallback;
}

/**
 * Registers this investor's interest in a project.
 *
 * The endpoint takes `funding_need_id` optionally; omitting it expresses
 * interest in the whole project, which is what this control means and what the
 * seeded demo data exercises. Sending `{}` rather than no body at all because
 * the handler reads and validates a JSON object.
 */
export function InterestButton({
  projectId,
  projectName,
  alreadyEngaged = false,
  onEngaged,
  className,
}: InterestButtonProps) {
  const [state, setState] = useState<InterestState>(
    alreadyEngaged ? { kind: "engaged" } : { kind: "idle" },
  );

  async function expressInterest() {
    setState({ kind: "pending" });

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/engagements`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (response.ok) {
        setState({ kind: "engaged" });
        onEngaged?.(projectId);
        return;
      }

      const failure: unknown = await response.json().catch(() => null);
      const code =
        typeof failure === "object" &&
        failure !== null &&
        typeof (failure as { code?: unknown }).code === "string"
          ? (failure as { code: string }).code
          : null;

      /**
       * A conflict means the engagement this button exists to create is
       * already there. That is the goal state, not a failure, so it renders as
       * success rather than as an error the investor has to interpret.
       */
      if (response.status === 409 || code === "conflict") {
        setState({ kind: "engaged" });
        onEngaged?.(projectId);
        return;
      }

      if (code === "forbidden_tier") {
        setState({
          kind: "needs_onboarding",
          message: messageFrom(
            failure,
            "Complete investor onboarding before expressing interest.",
          ),
        });
        return;
      }

      if (response.status === 401) {
        setState({
          kind: "needs_sign_in",
          message: messageFrom(failure, "Sign in as an investor to continue."),
        });
        return;
      }

      setState({
        kind: "refused",
        message: messageFrom(
          failure,
          `Could not register interest (HTTP ${response.status}).`,
        ),
      });
    } catch {
      setState({
        kind: "refused",
        message: "Could not reach the server. Check your connection.",
      });
    }
  }

  if (state.kind === "engaged") {
    return (
      <p className={cx(styles.engaged, className)}>
        <span aria-hidden="true">✓</span> Interest registered
      </p>
    );
  }

  return (
    <div className={cx(styles.wrapper, className)}>
      <button
        className={styles.button}
        disabled={state.kind === "pending"}
        onClick={() => void expressInterest()}
        type="button"
      >
        {state.kind === "pending" ? "Registering…" : "Express interest"}
        <span className={styles.visuallyHidden}> in {projectName}</span>
      </button>

      {state.kind === "needs_onboarding" ||
      state.kind === "needs_sign_in" ||
      state.kind === "refused" ? (
        <p className={styles.error} role="alert">
          {state.message}
          {state.kind === "needs_onboarding" ? (
            <>
              {" "}
              <a className={styles.errorLink} href="/join?start=i-would-fund">
                Complete onboarding
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
