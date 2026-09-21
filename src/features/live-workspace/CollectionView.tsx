import { JOURNEY_STAGES } from "@/domain/journey";
import { CollectionResults } from "@/components/workspace";
import type { LiveRole, ReadRecord, SnapshotQuery } from "@/features/live-read";
import { MapLimit } from "./MapLimit";
import { ServerFilters } from "./ServerFilters";
import { projectRow, recordName, selectReadRecords, type CollectionState, type CollectionSort } from "./presentation";
import styles from "./Workspace.module.css";

interface CollectionViewProps {
  records: readonly ReadRecord[];
  state: CollectionState;
  onChange: (state: CollectionState) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  role?: LiveRole;
  query?: SnapshotQuery;
  onQuery?: (query: SnapshotQuery) => void;
  projectTypes?: readonly string[];
  pending?: boolean;
  actionPending?: boolean;
}

export function CollectionView({ records, state, onChange, selectedId, onSelect, onOpen,
  role, query, onQuery, projectTypes = [], pending = false, actionPending = false }: CollectionViewProps) {
  const filtered = selectReadRecords(records, state);
  const pages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  const page = Math.min(Math.max(1, state.page), pages);
  const visible = filtered.slice((page - 1) * state.pageSize, page * state.pageSize);
  const selected = records.find((record) => record.id === selectedId);
  const selectedVisible = selectedId !== null && visible.some((record) => record.id === selectedId);
  const update = (change: Partial<CollectionState>) => onChange({ ...state, ...change, page: 1 });
  return <div className={styles.stack}>
    <MapLimit />
    <div className={styles.split} data-testid="live-collection-with-guidance">
      <section className={styles.panel} aria-label="Permitted record collection">
        <h2>Your permitted collection</h2>
        {role && query && onQuery && <ServerFilters role={role} query={query}
          projectTypes={projectTypes} disabled={actionPending} onApply={onQuery} />}
        <h3>Loaded record controls</h3>
        <div className={styles.filters}>
          <label className={styles.field}>Search permitted records
            <input value={state.query} onChange={(event) => update({ query: event.target.value })} placeholder="Name or location" />
          </label>
          <label className={styles.field}>Lifecycle stage
            <select value={state.stage} onChange={(event) => update({ stage: event.target.value })}>
              <option value="all">All stages</option>
              {JOURNEY_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              <option value="unknown">Not supplied</option>
            </select>
          </label>
          <label className={styles.field}>Site type
            <select value={state.siteType} onChange={(event) => update({ siteType: event.target.value })}>
              <option value="all">All site types</option><option value="rooftop">Rooftop</option>
              <option value="land">Land</option><option value="unknown">Not supplied</option>
            </select>
          </label>
          <label className={styles.field}>Sort records
            <select value={state.sort} onChange={(event) => {
              const sort = event.target.value;
              if (isSort(sort)) update({ sort });
            }}>
              <option value="stage-asc">Lifecycle: earlier first</option>
              <option value="stage-desc">Lifecycle: later first</option>
              <option value="name">Name</option><option value="updated">Recently updated</option>
            </select>
          </label>
        </div>
        <div className={styles.toolbar}>
          <p aria-live="polite">{pending ? "Updating authorized service results..." : filtered.length === 0 ? "No loaded records match these filters." :
            `${(page - 1) * state.pageSize + 1}-${Math.min(page * state.pageSize, filtered.length)} of ${filtered.length} matching loaded records`}</p>
          <div className={styles.actions} aria-label="Collection display">
            <button type="button" className={styles.button} aria-pressed={state.display === "list"}
              onClick={() => onChange({ ...state, display: "list" })}>List</button>
            <button type="button" className={styles.button} aria-pressed={state.display === "cards"}
              onClick={() => onChange({ ...state, display: "cards" })}>Cards</button>
          </div>
        </div>
        {!pending && state.page > pages && <p role="status" className={styles.muted}>The loaded collection changed. Showing its last available page.</p>}
        {selected && !selectedVisible && <p className={styles.muted}>Selected: {recordName(selected)}. It is outside this page or filter; your selection is retained.</p>}
        {!pending && <CollectionResults rows={visible.map(projectRow)} selectedId={selectedId}
          onSelect={onSelect} onOpen={onOpen} display={state.display} label="Permitted projects and sites" />}
        <div className={styles.toolbar}>
          <label className={styles.field}>Records per page
            <select value={state.pageSize} onChange={(event) => {
              const value = Number(event.target.value);
              if (value === 25 || value === 50 || value === 100) update({ pageSize: value });
            }}>
              <option value="25">25</option><option value="50">50</option><option value="100">100</option>
            </select>
          </label>
          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={pending || page <= 1}
              onClick={() => onChange({ ...state, page: page - 1 })}>Previous page</button>
            <span>{pending ? "Loading pages..." : `Page ${page} of ${pages}`}</span>
            <button type="button" className={styles.button} disabled={pending || page >= pages}
              onClick={() => onChange({ ...state, page: page + 1 })}>Next page</button>
          </div>
        </div>
        <p className={styles.muted}>Loaded-record controls and pages apply locally to the service-filtered collection. They do not grant access or claim a complete account-wide total.</p>
      </section>
      <aside className={styles.panel} aria-label="Contextual read guidance">
        <p className={styles.eyebrow}>Deterministic help</p>
        <h2>{selected ? recordName(selected) : "Read the evidence, keep the context"}</h2>
        <p>{selected
          ? "Open the stored record to distinguish its preliminary screening, current lifecycle and any supplied human decision."
          : "Select a record to keep a clear context. The collection and this guidance remain usable together."}</p>
        <p>Documents describe their audience and source. Viewing evidence does not review, acknowledge, fund or approve anything.</p>
        {selected && <button type="button" className={styles.button} onClick={() => onOpen(selected.id)}>Open selected record</button>}
        <p className={styles.muted}>This is scripted guidance, not generated analysis, a task or a notification.</p>
      </aside>
    </div>
  </div>;
}

function isSort(value: string): value is CollectionSort {
  return value === "stage-asc" || value === "stage-desc" || value === "name" || value === "updated";
}
