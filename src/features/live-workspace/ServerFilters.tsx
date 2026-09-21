import { useState } from "react";
import {
  PROJECT_STAGES, SITE_TYPES, SUBMISSION_STATUSES, VIABILITY_STATUSES,
  type WorkspaceQuery,
} from "@/domain/workspace-filters";
import type { LiveRole } from "@/features/live-read";
import styles from "./Workspace.module.css";

const label = (value: string) => value.replace(/_/g, " ");

export function ServerFilters({ role, query, projectTypes, disabled, onApply }: {
  role: LiveRole;
  query: WorkspaceQuery;
  projectTypes: readonly string[];
  disabled: boolean;
  onApply: (query: WorkspaceQuery) => void;
}) {
  const appliedLocation = query.location ?? "";
  const [location, setLocation] = useState({ applied: appliedLocation, draft: appliedLocation });
  if (location.applied !== appliedLocation) setLocation({ applied: appliedLocation, draft: appliedLocation });
  if (role === "site-owner") return null;
  const types = [...new Set([...projectTypes, ...(query.projectType ? [query.projectType] : [])])].sort();
  return <section aria-label="Service filters" className={styles.stack}>
    <h3>Filter the service collection</h3>
    <fieldset disabled={disabled} className={styles.filters}>
      <legend>{role === "investor" ? "Investor portfolio filters" : "Operator submission filters"}</legend>
      {role === "investor" ? <fieldset className={styles.field}>
        <legend>Project stage</legend>
        {PROJECT_STAGES.map((stage) => <label key={stage}>
          <input type="checkbox" checked={query.stages?.includes(stage) ?? false}
            onChange={(event) => onApply({ ...query, stages: event.target.checked
              ? [...(query.stages ?? []), stage] : (query.stages ?? []).filter((value) => value !== stage) })} />
          {label(stage)}
        </label>)}
      </fieldset> : <fieldset className={styles.field}>
        <legend>Submission status</legend>
        {SUBMISSION_STATUSES.map((status) => <label key={status}>
          <input type="checkbox" checked={query.statuses?.includes(status) ?? false}
            onChange={(event) => onApply({ ...query, statuses: event.target.checked
              ? [...(query.statuses ?? []), status] : (query.statuses ?? []).filter((value) => value !== status) })} />
          {label(status)}
        </label>)}
      </fieldset>}
      <label className={styles.field}>Service viability
        <select value={query.viability ?? ""} onChange={(event) => {
          const next = { ...query };
          const value = VIABILITY_STATUSES.find((item) => item === event.target.value);
          if (value === undefined) delete next.viability;
          else next.viability = value;
          onApply(next);
        }}>
          <option value="">Any viability</option>
          {VIABILITY_STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
        </select>
      </label>
      {role === "investor" ? <>
        <label className={styles.field}>Project type
          <select value={query.projectType ?? ""} onChange={(event) => {
            const next = { ...query };
            if (event.target.value === "") delete next.projectType;
            else next.projectType = event.target.value;
            onApply(next);
          }}>
            <option value="">Any project type</option>
            {types.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Stored mandate</span>
          <span><input type="checkbox" checked={query.mandateMatch !== false}
            aria-label="Only projects matching the stored mandate"
            onChange={(event) => onApply({ ...query, mandateMatch: event.target.checked })} />
            Only projects matching the stored mandate</span>
        </label>
      </> : <>
        <label className={styles.field}>Service site type
          <select value={query.siteType ?? ""} onChange={(event) => {
            const next = { ...query };
            const value = SITE_TYPES.find((item) => item === event.target.value);
            if (value === undefined) delete next.siteType;
            else next.siteType = value;
            onApply(next);
          }}>
            <option value="">Any site type</option>
            {SITE_TYPES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
        <form className={styles.field} onSubmit={(event) => {
          event.preventDefault();
          const next = { ...query };
          const value = location.draft.trim();
          if (value === "") delete next.location;
          else next.location = value;
          onApply(next);
        }}>
          <label>Service location
            <input type="search" value={location.draft} maxLength={200}
              onChange={(event) => setLocation({ applied: appliedLocation, draft: event.target.value })} />
          </label>
          <button type="submit" className={styles.button}>Apply location</button>
        </form>
      </>}
    </fieldset>
    <p className={styles.muted}>
      These controls re-read authorized service results. Paging, sorting and the loaded-record controls below remain local.
      {role === "investor" ? " Widening the mandate filter does not change your stored mandate or access." :
        " Submission status and lifecycle stage are different. Some statuses have no pipeline-eligible records."}
    </p>
  </section>;
}
