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
      <p>The backend now offers a GeoJSON <code>FeatureCollection</code> in EPSG:4326
        to authenticated site owners and operators. This workspace does not call that parcel endpoint yet:
        runtime provenance, disclosure and the project-join contract still need configured admission.
        This is not a live feed.</p>
      <p>Parcel credentials and ESRI provider/account tokens stay on the backend, including short-lived or
        referer-bound tokens. This browser integration does not request, receive or store them.
        Basemap setup and provider entitlements have not been verified for this frontend.</p>
      <p>The list remains useful. No private parcel sample, invented geography or another
        role&apos;s precise coordinates fill this space.</p>
      <p className={styles.muted}>The endpoint defaults to synthetic parcels; freshness metadata alone
        does not prove live GIS. No automatic map polling is configured.
        The editing seam is <code>SUNSUM-CONNECTION:MAPS-LOCATION</code>;
        endpoint and disclosure admission remain separate from project access.</p>
    </div>
  </section>;
}
