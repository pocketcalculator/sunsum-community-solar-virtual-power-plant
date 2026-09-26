"use client";

import { useRef } from "react";
import { VppEducation } from "./VppEducation";
import styles from "./CommunityContext.module.css";

interface PublicLearningProps {
  returnFocusId?: string;
}

export function PublicLearning({ returnFocusId }: PublicLearningProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  const returnToContext = () => {
    if (detailsRef.current) detailsRef.current.open = false;
    const target = returnFocusId ? document.getElementById(returnFocusId) : null;
    (target ?? summaryRef.current)?.focus();
  };

  return (
    <details className={styles.disclosure} ref={detailsRef}>
      <summary className={styles.summary} ref={summaryRef}>
        Learning and help (optional)
      </summary>
      <div className={styles.disclosureBody}>
        <section className={styles.education} aria-label="Website orientation">
          <h2 className={styles.sectionTitle}>Find your way around</h2>
          <p>
            Skip this learning or revisit it whenever you like. Opening it does
            not move you to another step or clear your unfinished answers.
          </p>
          <ol className={styles.orientation}>
            <li>Read the Need, Opportunity and Impact stories for the proposed approach.</li>
            <li>Try the public profile preview with fictional details. No account, sign-in or code is created, and nothing is saved or sent.</li>
            <li>Check the workspace&apos;s labeled mode: connected reads need authorized access; a separately labeled synthetic demo uses fictional scenarios. Public choices do not grant access.</li>
          </ol>
        </section>

        <VppEducation />

        <section className={styles.education} aria-label="Human adoption support">
          <h2 className={styles.sectionTitle}>People support adoption; this page explains</h2>
          <p>
            Human adoption support means listening to a community&apos;s goals,
            explaining participation choices and helping people agree on
            responsibilities. Those conversations and project-specific decisions
            need the relevant people; fixed website guidance cannot replace them.
          </p>
          <p>
            Help here is written, deterministic guidance, not a conversation with
            a person. This is not a staffed chat. Opening help does not
            contact a project manager or request a service, and this preview
            provides no contact or booking channel.
          </p>
        </section>

        <button className={styles.returnButton} type="button" onClick={returnToContext}>
          {returnFocusId ? "Return to profile preview" : "Close learning and return"}
        </button>
      </div>
    </details>
  );
}
