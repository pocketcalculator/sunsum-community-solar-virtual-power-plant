/**
 * Public interface of the site-owner dashboard.
 *
 * The feature is browser-safe and imports no backend module. It renders
 * whatever locations it is handed and falls back to local mock data when given
 * none, which is how the long-standing intent here — that the dashboard
 * "receive an authorized composed view from S-VIEW rather than importing
 * backend modules into presentation code" — is satisfied: the page performs
 * the authorized read and {@link toDashboardLocations} only changes shape.
 */
export {
  SiteOwnerDashboard,
  type DashboardDataSource,
  type SiteOwnerDashboardProps,
} from "./components/SiteOwnerDashboard";
export {
  DASHBOARD_LOCATIONS,
  MAX_SELECTED_LOCATIONS,
  RETURN_POINTS,
  type DashboardLocation,
} from "./model/mockDashboard";
export { toDashboardLocation, toDashboardLocations } from "./model/fromOwnerSites";
