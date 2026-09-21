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
          <p>Use the team&apos;s accepted same-origin read contract and database-backed environment.</p></li>
        <li><strong>Use your approved sign-in</strong>
          <p>The service confirms your identity and access. A demo role switch cannot do that.</p></li>
        <li><strong>Read only what is permitted</strong>
          <p>Open stored projects, evidence and next work. No business workflow is changed here.</p></li>
      </ol>
      <div className={styles.actions}>
        <a className={`${styles.button} ${styles.primary}`}
          href="https://github.com/pocketcalculator/sunsum-community-solar-virtual-power-plant/blob/faccb47e7ba625f52ef6266fe7e7216b8adca59d/docs/ws1/connection-and-deployment-guide.md"
          target="_blank" rel="noreferrer">Open the connection guide</a>
        <a className={styles.button} href="https://nicolassalazar-pro.github.io/sunsum-ui-demo/"
          target="_blank" rel="noreferrer">Explore the separate fictional demo</a>
      </div>
      <p className={styles.muted}>The demo opens separately. No live records, credentials or service session are transferred to it.</p>
    </section>
  );
}
