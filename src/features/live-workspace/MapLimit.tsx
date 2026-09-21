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
      <p>Expected map data is a standard GeoJSON <code>FeatureCollection</code> in EPSG:4326
        from the existing backend. An operator-only candidate-parcel feed has been proposed;
        runtime provenance, disclosure and the project-join contract still need configured admission.
        No backend map endpoint is admitted here yet, so this is not a live feed.</p>
      <p>Parcel credentials and ESRI provider/account tokens stay on the backend, including short-lived or
        referer-bound tokens. This browser integration does not request, receive or store them.
        A separate basemap key or entitlement has not been provisioned.</p>
      <p>The list remains useful. No private parcel sample, invented geography or another
        role&apos;s precise coordinates fill this space.</p>
      <p className={styles.muted}>Map refresh cadence is unknown; no automatic map polling is configured.
        A reviewed backend snapshot may suffice. The editing seam is <code>SUNSUM-CONNECTION:MAPS-LOCATION</code>;
        endpoint and disclosure admission remain separate from project access.</p>
    </div>
  </section>;
}
