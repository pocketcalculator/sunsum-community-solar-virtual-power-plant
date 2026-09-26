import type { LiveReadConfiguration } from "@/domain/live-configuration";
import styles from "./Workspace.module.css";

export function ConnectionSetup({ configuration }: { configuration: LiveReadConfiguration }) {
  return (
    <section className={styles.welcome} aria-labelledby="connection-heading">
      <p className={styles.eyebrow}>Real context starts with the right connection</p>
      <h2 id="connection-heading">Your service connection is out of reach right now</h2>
      <p>{configuration.reason}</p>
      <ol className={styles.steps}>
        <li><strong>Confirm the existing service</strong>
          <p>Use the accepted same-origin contract: an approved database-backed connection, or an explicitly isolated mock-backed server demo.</p></li>
        <li><strong>Use your approved sign-in</strong>
          <p>The service confirms real participant access. A seeded demo switch only works in the explicitly fictional server-demo mode.</p></li>
        <li><strong>Read only what is permitted</strong>
          <p>Open stored projects and evidence. Nonbinding interest requires an explicit admitted investor action; other writes stay unavailable.</p></li>
      </ol>
      <div className={styles.actions}>
        <a className={`${styles.button} ${styles.primary}`}
          href="https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/blob/0e517d74ce1def739fb8c03a08f86fb0713bc23f/docs/ws1/connection-and-deployment-guide.md"
          target="_blank" rel="noreferrer">Open the connection guide</a>
        <a className={styles.button} href="https://nicolassalazar-pro.github.io/sunsum-ui-demo/"
          target="_blank" rel="noreferrer">Explore the separate fictional demo</a>
      </div>
      <p className={styles.muted}>The demo opens separately. No live records, credentials or service session are transferred to it.</p>
    </section>
  );
}
