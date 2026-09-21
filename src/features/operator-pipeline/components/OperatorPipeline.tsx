"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import {
  DEFAULT_PIPELINE_FILTERS,
  SITE_TYPES,
  SUBMISSION_STATUSES,
  VIABILITY_STATUSES,
  formatCapacityKw,
  humanize,
  pipelineQueryString,
  toPipelineView,
  type PipelineCard,
  type PipelineDataSource,
  type PipelineFilters,
  type PipelineView,
} from "../model/pipeline";
import styles from "./OperatorPipeline.module.css";

/**
 * Rows per page. Client-side over rows the API already returned: `GET
 * /pipeline` has no paging parameters, and the board is small enough that one
 * read and browser paging beats a round trip.
 */
const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

export interface OperatorPipelineProps {
  readonly initialView: PipelineView;
  readonly dataSource?: PipelineDataSource;
}

export function OperatorPipeline({
  initialView,
  dataSource = "sample",
}: OperatorPipelineProps) {
  const [view, setView] = useState<PipelineView>(initialView);
  const [filters, setFilters] = useState<PipelineFilters>(
    DEFAULT_PIPELINE_FILTERS,
  );
  const [locationDraft, setLocationDraft] = useState("");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isLive = dataSource === "live";

  /**
   * Which read is current.
   *
   * Filter changes each start a request, and responses can arrive out of
   * order — a slow read for an abandoned filter set resolving after a fast one
   * for the current set would replace the rows while the newer filters stay
   * selected. Each response is tagged with the request that asked for it and
   * dropped if it is no longer the latest.
   */
  const latestRequest = useRef(0);

  const reload = useCallback(
    async (next: PipelineFilters) => {
      /** The sample is not backed by the API; it is filtered in the browser. */
      if (!isLive) return;

      const requestId = latestRequest.current + 1;
      latestRequest.current = requestId;
      const isCurrent = () => latestRequest.current === requestId;

      setLoading(true);
      setLoadError(null);
      try {
        const query = pipelineQueryString(next);
        const response = await fetch(
          query === "" ? "/api/pipeline" : `/api/pipeline?${query}`,
          { headers: { accept: "application/json" } },
        );
        if (!isCurrent()) return;

        if (!response.ok) {
          const failure: unknown = await response.json().catch(() => null);
          if (!isCurrent()) return;
          setLoadError(
            typeof failure === "object" &&
              failure !== null &&
              typeof (failure as { message?: unknown }).message === "string"
              ? (failure as { message: string }).message
              : `Could not load the pipeline (HTTP ${response.status}).`,
          );
          return;
        }

        const parsed = toPipelineView(await response.json());
        if (!isCurrent()) return;

        if (parsed === null) {
          setLoadError("The pipeline response was not in the expected shape.");
          return;
        }
        setView(parsed);
      } catch {
        if (!isCurrent()) return;
        setLoadError("Could not reach the server. Check your connection.");
      } finally {
        /** Only the newest request may clear the spinner. */
        if (isCurrent()) setLoading(false);
      }
    },
    [isLive],
  );

  function applyFilters(next: PipelineFilters) {
    setFilters(next);
    setPage(1);
    void reload(next);
  }

  const visibleCards = useMemo(
    () => (isLive ? view.cards : filterLocally(view.cards, filters)),
    [isLive, view.cards, filters],
  );

  const pageCount = Math.max(1, Math.ceil(visibleCards.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageCards = visibleCards.slice(pageStart, pageStart + pageSize);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Operator workspace</p>
        <h1 className={styles.title}>Submission pipeline</h1>
        <p className={styles.description}>
          {isLive
            ? "Sites and projects moving through the delivery journey, read live from the Sunsum platform."
            : "An illustrative pipeline. These are not real submissions and the addresses are invented. Sign in as an operator to read live data."}
        </p>
      </header>

      {/*
        The funnel, as counts per stage. Each stage carries its own colour so
        the shape of the pipeline is readable at a glance rather than only by
        reading numbers.
      */}
      <ol className={styles.funnel} role="list">
        {view.stageCounts.map((stage) => (
          <li
            className={styles.funnelStage}
            data-stage={stage.journeyStageId}
            key={stage.journeyStageId}
          >
            <span className={styles.funnelCount}>{stage.count}</span>
            <span className={styles.funnelLabel}>{stage.label}</span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="pipeline-filters" className={styles.filters}>
        <h2 className={styles.filtersTitle} id="pipeline-filters">
          Filter submissions
        </h2>

        <div className={styles.filterRow}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Submission status</legend>
            <div className={styles.checkboxes}>
              {SUBMISSION_STATUSES.map((status) => (
                <label className={styles.checkbox} key={status}>
                  <input
                    checked={filters.statuses.includes(status)}
                    onChange={(event) =>
                      applyFilters({
                        ...filters,
                        statuses: event.target.checked
                          ? [...filters.statuses, status]
                          : filters.statuses.filter((item) => item !== status),
                      })
                    }
                    type="checkbox"
                    value={status}
                  />
                  <span>{humanize(status)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="pipeline-site-type">
              Site type
            </label>
            <select
              className={styles.select}
              id="pipeline-site-type"
              onChange={(event) =>
                applyFilters({
                  ...filters,
                  siteType: event.target.value === "" ? null : event.target.value,
                })
              }
              value={filters.siteType ?? ""}
            >
              <option value="">Any</option>
              {SITE_TYPES.map((siteType) => (
                <option key={siteType} value={siteType}>
                  {humanize(siteType)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="pipeline-viability">
              Viability
            </label>
            <select
              className={styles.select}
              id="pipeline-viability"
              onChange={(event) =>
                applyFilters({
                  ...filters,
                  viability:
                    event.target.value === "" ? null : event.target.value,
                })
              }
              value={filters.viability ?? ""}
            >
              <option value="">Any</option>
              {VIABILITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {humanize(status)}
                </option>
              ))}
            </select>
          </div>

          {/*
            Submitted rather than filtered on every keystroke: each change is a
            request, and location is free text rather than a short enum.
          */}
          <form
            className={styles.field}
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters({ ...filters, location: locationDraft || null });
            }}
          >
            <label className={styles.label} htmlFor="pipeline-location">
              Location
            </label>
            <div className={styles.inlineField}>
              <input
                className={styles.input}
                id="pipeline-location"
                onChange={(event) => setLocationDraft(event.target.value)}
                placeholder="Town or street"
                type="search"
                value={locationDraft}
              />
              <button className={styles.applyButton} type="submit">
                Apply
              </button>
            </div>
          </form>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="pipeline-page-size">
              Sites per page
            </label>
            <select
              className={styles.select}
              id="pipeline-page-size"
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              value={pageSize}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {loadError === null ? null : (
        <Callout tone="caution" title="Could not update the pipeline">
          <p className={styles.plain} role="alert">
            {loadError}
          </p>
        </Callout>
      )}

      <p aria-live="polite" className={styles.summary}>
        {loading
          ? "Updating…"
          : `${visibleCards.length} ${
              visibleCards.length === 1 ? "site" : "sites"
            }${pageCount > 1 ? ` · page ${currentPage} of ${pageCount}` : ""}`}
      </p>

      {pageCards.length === 0 ? (
        <Callout tone="info" title="No submissions match these filters">
          <p className={styles.plain}>
            Try clearing a status, widening the site type, or removing the
            location.
          </p>
        </Callout>
      ) : (
        <ul className={styles.list} role="list">
          {pageCards.map((card) => (
            <li key={card.id}>
              <PipelineRow card={card} />
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pipeline pages" className={styles.pagination}>
          <button
            className={styles.pageButton}
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
            type="button"
          >
            Previous
          </button>
          <span className={styles.pageStatus}>
            Page {currentPage} of {pageCount}
          </span>
          <button
            className={styles.pageButton}
            disabled={currentPage === pageCount}
            onClick={() => setPage(currentPage + 1)}
            type="button"
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}

function PipelineRow({ card }: { readonly card: PipelineCard }) {
  const capacity = formatCapacityKw(card.estimatedCapacityKw);

  return (
    <article className={styles.row} data-stage={card.journeyStageId}>
      <div className={styles.rowMain}>
        <h3 className={styles.rowTitle}>{card.displayName}</h3>
        {card.addressRaw === null ? null : (
          <p className={styles.rowAddress}>{card.addressRaw}</p>
        )}
      </div>

      <div className={styles.rowBadges}>
        <Badge tone="accent">{card.journeyStageLabel}</Badge>
        <Badge tone="neutral">{card.siteTypeLabel}</Badge>
        {card.submissionStatusLabel === null ? null : (
          <Badge tone="neutral">{card.submissionStatusLabel}</Badge>
        )}
        {card.viabilityLabel === null ? null : (
          <Badge tone="neutral">{card.viabilityLabel}</Badge>
        )}
      </div>

      <p className={styles.rowCapacity}>{capacity ?? "Capacity not estimated"}</p>
    </article>
  );
}

/** Only used for the sample, which no server is filtering. */
function filterLocally(
  cards: readonly PipelineCard[],
  filters: PipelineFilters,
): readonly PipelineCard[] {
  const location = filters.location?.trim().toLowerCase() ?? "";

  return cards.filter((card) => {
    if (
      filters.statuses.length > 0 &&
      (card.submissionStatus === null ||
        !filters.statuses.includes(card.submissionStatus))
    ) {
      return false;
    }
    if (filters.siteType !== null && card.siteType !== filters.siteType) {
      return false;
    }
    if (
      filters.viability !== null &&
      card.viabilityStatus !== filters.viability
    ) {
      return false;
    }
    if (
      location !== "" &&
      !(card.addressRaw ?? "").toLowerCase().includes(location)
    ) {
      return false;
    }
    return true;
  });
}
