import { Callout } from "@/components/ui/Callout";
import { ActionLink } from "@/components/ui/ActionLink";
import type { ProfileSummary } from "../model/profile";
import { ProfileSummaryList } from "./ProfileSummaryList";
import buttons from "./buttons.module.css";
import styles from "./CompletionPanel.module.css";

interface CompletionPanelProps {
  summary: ProfileSummary;
  onEdit: () => void;
  onLearn: () => void;
}

/**
 * What actually happened at the end: a profile was assembled in the browser and
 * nothing more. No account id, no confirmation message, no claim of success.
 */
export function CompletionPanel({ summary, onEdit, onLearn }: CompletionPanelProps) {
  return (
    <div className={styles.panel}>
      <Callout title="Assembled, but not saved" tone="caution">
        <p>
          Your fictional answers were put together in this browser only. This
          public preview creates no account, requests no code and sends nothing.
          No email will arrive and no workspace access has been granted.
        </p>
        <p>Leaving or reloading this page clears everything below.</p>
      </Callout>

      <section className={styles.details}>
        <h3 className={styles.title}>The fictional profile you assembled</h3>
        <ProfileSummaryList summary={summary} />
      </section>

      <section className={styles.details} aria-label="Where to explore next">
        <h3 className={styles.title}>
          {summary.role === null ? "Keep exploring through learning" : "Explore without a role grant"}
        </h3>
        <p>
          {summary.role === null
            ? "Research, workforce and other learning interests continue through the same learning and help. There is no additional workspace, enrolment or contact request."
            : "Check the workspace's labeled mode. Connected reads depend on authorized access; a separately labeled synthetic demo uses fictional scenarios. These answers are not carried into either as an identity or permission."}
        </p>
        <button className={buttons.secondary} onClick={onLearn} type="button">
          Open learning and help
        </button>
        {summary.role !== null ? (
          <ActionLink href="/app" variant="secondary">Explore workspace</ActionLink>
        ) : null}
        <ActionLink href="/#faq" variant="secondary">Return to common questions</ActionLink>
      </section>

      <button className={buttons.secondary} onClick={onEdit} type="button">
        Go back and edit
      </button>
    </div>
  );
}
