"use client";

import type { CollectionResultsProps } from "./types";
import s from "./CollectionResults.module.css";

export function CollectionResults({ rows, selectedId, onSelect, onOpen, display, label }: CollectionResultsProps) {
  return <section aria-label={label} className={s.results} data-display={display}>
    {rows.length ? <ul className={display === "cards" ? s.cards : s.list}>
      {rows.map((row) => <li key={row.id} className={s.project}
        data-project-id={row.id} data-selected={selectedId === row.id}>
        <button type="button" className={s.select} aria-label={`Select ${row.title}`}
          aria-pressed={selectedId === row.id} onClick={() => onSelect(row.id)}>
          <strong>{row.title}</strong><span>{row.subtitle}</span>
        </button>
        <dl className={s.facts}>
          <div><dt>Project stage</dt><dd>{row.stage}</dd></div>
          <div><dt>Capacity</dt><dd>{row.capacity}</dd></div>
          <div><dt>Screening</dt><dd className={s.screening} data-tone={row.screeningTone ?? "neutral"}>{row.screening}</dd></div>
        </dl>
        <button type="button" className={s.open} data-record-id={row.id} data-project-open={row.id}
          aria-label={`Open ${row.title}`} onClick={() => onOpen(row.id)}>Open <span aria-hidden="true">&rarr;</span></button>
      </li>)}
    </ul> : <p role="status" className={s.empty}>No projects in this view.</p>}
  </section>;
}
