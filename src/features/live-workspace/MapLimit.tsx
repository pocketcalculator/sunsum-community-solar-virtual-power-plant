import styles from "./Workspace.module.css";

export function MapLimit() {
  return <section className={`${styles.panel} ${styles.mapLimit}`} aria-labelledby="map-limit-heading">
    <div className={styles.mapSymbol} aria-hidden="true">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="m4 10 10-4 12 4 10-4v24l-10 4-12-4-10 4V10ZM14 6v24M26 10v24" />
      </svg>
    </div>
    <div>
      <p className={styles.eyebrow}>Location, without guesswork</p>
      <h2 id="map-limit-heading">A permitted map source is out of reach right now</h2>
      <p>The list below remains useful. No fictional geography, new geocoding,
        private parcels or another role&apos;s precise coordinates fill this space.</p>
      <p className={styles.muted}>Map and location-source admission are separate from access to project records.</p>
    </div>
  </section>;
}
