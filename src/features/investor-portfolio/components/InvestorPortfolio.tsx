"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import {
  DEFAULT_PORTFOLIO_FILTERS,
  PROJECT_STAGES,
  VIABILITY_STATUSES,
  formatRange,
  humanize,
  portfolioQueryString,
  toPortfolioView,
  type PortfolioDataSource,
  type PortfolioFilters,
  type PortfolioProject,
  type PortfolioView,
} from "../model/portfolio";
import { InterestButton } from "./InterestButton";
import styles from "./InvestorPortfolio.module.css";

/**
 * Cards per page. Purely a presentation choice over rows the API already
 * returned — the portfolio endpoint has no paging parameters, and for a demo
 * dataset this size fetching everything once and paging in the browser is both
 * simpler and faster than round-tripping.
 *
 * The larger values are the ones asked for in review; the smaller ones exist
 * because the seeded dataset is a handful of projects, and a page size no
 * result set ever exceeds makes the control look broken.
 */
const PAGE_SIZES = [6, 12, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 6;

export interface InvestorPortfolioProps {
  readonly initialView: PortfolioView;
  readonly dataSource?: PortfolioDataSource;
  readonly initialEngagedProjectIds?: readonly string[];
}

export function InvestorPortfolio({
  initialView,
  dataSource = "sample",
  initialEngagedProjectIds = [],
}: InvestorPortfolioProps) {
  const [view, setView] = useState<PortfolioView>(initialView);
  const [filters, setFilters] = useState<PortfolioFilters>({
    ...DEFAULT_PORTFOLIO_FILTERS,
    mandateMatch: initialView.mandateMatch,
  });
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [engaged, setEngaged] = useState<readonly string[]>(
    initialEngagedProjectIds,
  );

  /**
   * Project type is free text on the wire rather than an enum, so its options
   * can only come from data. Accumulated across loads so that narrowing the
   * list never removes the option the investor is currently filtering by.
   */
  const [projectTypes, setProjectTypes] = useState<readonly string[]>(() =>
    distinctProjectTypes(initialView.projects),
  );

  const isLive = dataSource === "live";

  /**
   * Which read is current.
   *
   * Every filter change starts a request, and responses can arrive out of
   * order — a slow read for an abandoned filter set resolving after a fast one
   * for the current set. Committing unconditionally would leave the cards and
   * the mandate summary describing a query the investor has already moved on
   * from. Each response is therefore tagged with the request that asked for it
   * and dropped if it is no longer the latest.
   */
  const latestRequest = useRef(0);

  const reload = useCallback(
    async (next: PortfolioFilters) => {
      /**
       * The sample is not backed by the API, so re-querying it would replace
       * illustrative rows with a refusal. Filters still work: they are applied
       * in the browser below.
       */
      if (!isLive) return;

      const requestId = latestRequest.current + 1;
      latestRequest.current = requestId;
      const isCurrent = () => latestRequest.current === requestId;

      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `/api/portfolio?${portfolioQueryString(next)}`,
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
              : `Could not load the portfolio (HTTP ${response.status}).`,
          );
          return;
        }

        const parsed = toPortfolioView(await response.json());
        if (!isCurrent()) return;

        if (parsed === null) {
          setLoadError("The portfolio response was not in the expected shape.");
          return;
        }

        setView(parsed);
        setProjectTypes((known) =>
          mergeProjectTypes(known, distinctProjectTypes(parsed.projects)),
        );
      } catch {
        if (!isCurrent()) return;
        setLoadError("Could not reach the server. Check your connection.");
      } finally {
        /**
         * Only the newest request may clear the spinner. A superseded one
         * finishing would otherwise report "done" while a live read is still
         * in flight.
         */
        if (isCurrent()) setLoading(false);
      }
    },
    [isLive],
  );

  function applyFilters(next: PortfolioFilters) {
    setFilters(next);
    /** A new result set invalidates the current page number. */
    setPage(1);
    void reload(next);
  }

  /**
   * The sample has to be filtered somewhere, and the server is not available
   * to do it. Live rows arrive already filtered, so this is a no-op for them.
   */
  const visibleProjects = useMemo(
    () => (isLive ? view.projects : filterLocally(view.projects, filters)),
    [isLive, view.projects, filters],
  );

  /**
   * `page` is clamped on read rather than corrected in an effect: a filter
   * change that shrinks the result set would otherwise render one frame of an
   * out-of-range page before a second render fixed it.
   */
  const pageCount = Math.max(1, Math.ceil(visibleProjects.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageProjects = visibleProjects.slice(pageStart, pageStart + pageSize);

  const engagedSet = useMemo(() => new Set(engaged), [engaged]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Investor workspace</p>
        <h1 className={styles.title}>Project portfolio</h1>
        {isLive ? (
          <p className={styles.description}>
            Projects released to investors, read live from the Sunsum platform.
            Exact addresses, documents and owner identities are not shown at
            this disclosure tier. Nothing here is a financial, engineering or
            eligibility assessment.
          </p>
        ) : (
          <p className={styles.description}>
            An illustrative portfolio. These are not real projects, and the
            figures are sample values rather than a financial, engineering or
            eligibility assessment. Sign in as a financier to read live data.
          </p>
        )}
      </header>

      <section aria-labelledby="portfolio-filters" className={styles.filters}>
        <h2 className={styles.filtersTitle} id="portfolio-filters">
          Filter projects
        </h2>

        <div className={styles.filterRow}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Stage</legend>
            <div className={styles.checkboxes}>
              {PROJECT_STAGES.map((stage) => (
                <label className={styles.checkbox} key={stage}>
                  <input
                    checked={filters.stages.includes(stage)}
                    onChange={(event) =>
                      applyFilters({
                        ...filters,
                        stages: event.target.checked
                          ? [...filters.stages, stage]
                          : filters.stages.filter((item) => item !== stage),
                      })
                    }
                    type="checkbox"
                    value={stage}
                  />
                  <span>{humanize(stage)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="portfolio-viability">
              Viability
            </label>
            <select
              className={styles.select}
              id="portfolio-viability"
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

          <div className={styles.field}>
            <label className={styles.label} htmlFor="portfolio-project-type">
              Project type
            </label>
            <select
              className={styles.select}
              id="portfolio-project-type"
              onChange={(event) =>
                applyFilters({
                  ...filters,
                  projectType:
                    event.target.value === "" ? null : event.target.value,
                })
              }
              value={filters.projectType ?? ""}
            >
              <option value="">Any</option>
              {projectTypes.map((type) => (
                <option key={type} value={type}>
                  {humanize(type)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="portfolio-page-size">
              Projects per page
            </label>
            <select
              className={styles.select}
              id="portfolio-page-size"
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

        {/*
          `mandate_match` defaults to true on the server, so an investor's first
          view is already narrowed to what they could fund. Saying so and
          offering to widen is the difference between a short list and a list
          that looks broken.

          It is disabled on the sample, and that is not a limitation to work
          around. A mandate match is the server comparing an investor's profile
          against open funding needs; the sample has neither, so the only way to
          make this control "work" there would be to invent which fabricated
          projects match a mandate nobody holds. A disabled control that says
          why is honest; an enabled one that changes its own label while every
          card stays put is not.
        */}
        <label className={styles.mandateToggle}>
          <input
            checked={filters.mandateMatch}
            disabled={!isLive}
            onChange={(event) =>
              applyFilters({ ...filters, mandateMatch: event.target.checked })
            }
            type="checkbox"
          />
          <span>
            Only projects matching my mandate
            <span className={styles.mandateHint}>
              {!isLive
                ? " — sign in as a financier to match against your mandate"
                : filters.mandateMatch
                  ? " — clear this to see every released project"
                  : " — showing every released project"}
            </span>
          </span>
        </label>
      </section>

      {loadError === null ? null : (
        <Callout tone="caution" title="Could not update the portfolio">
          <p className={styles.plain} role="alert">
            {loadError}
          </p>
        </Callout>
      )}

      <p className={styles.summary} aria-live="polite">
        {loading
          ? "Updating…"
          : `${visibleProjects.length} ${
              visibleProjects.length === 1 ? "project" : "projects"
            }${
              pageCount > 1
                ? ` · page ${currentPage} of ${pageCount}`
                : ""
            }`}
      </p>

      {pageProjects.length === 0 ? (
        <Callout tone="info" title="No projects match these filters">
          <p className={styles.plain}>
            {filters.mandateMatch
              ? "Try clearing the mandate filter, or widening the stage and viability choices."
              : "Try widening the stage and viability choices."}
          </p>
        </Callout>
      ) : (
        <ul className={styles.grid} role="list">
          {pageProjects.map((project) => (
            <li key={project.projectId}>
              <ProjectCard
                engaged={engagedSet.has(project.projectId)}
                onEngaged={(id) =>
                  setEngaged((current) =>
                    current.includes(id) ? current : [...current, id],
                  )
                }
                project={project}
                showInterest={isLive}
              />
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Portfolio pages" className={styles.pagination}>
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

interface ProjectCardProps {
  readonly project: PortfolioProject;
  readonly engaged: boolean;
  readonly showInterest: boolean;
  readonly onEngaged: (projectId: string) => void;
}

function ProjectCard({
  project,
  engaged,
  showInterest,
  onEngaged,
}: ProjectCardProps) {
  const capacity = formatRange(
    project.capacityKwLow,
    project.capacityKwHigh,
    "kW",
  );
  const generation = formatRange(
    project.generationKwhLow,
    project.generationKwhHigh,
    "kWh per year",
  );

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{project.name}</h3>
        <p className={styles.cardLocality}>{project.locality}</p>
      </div>

      <div className={styles.badges}>
        <Badge tone="accent">{project.stageLabel}</Badge>
        <Badge tone="neutral">{project.siteTypeLabel}</Badge>
        {project.viabilityLabel === null ? null : (
          <Badge tone="neutral">{project.viabilityLabel}</Badge>
        )}
      </div>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Estimated capacity</dt>
          <dd>{capacity ?? "Not yet estimated"}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Estimated generation</dt>
          <dd>{generation ?? "Not yet estimated"}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Project type</dt>
          <dd>
            {project.projectType === null
              ? "Not yet classified"
              : humanize(project.projectType)}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Open funding needs</dt>
          <dd>{project.openFundingNeedsCount}</dd>
        </div>
      </dl>

      {showInterest ? (
        <InterestButton
          alreadyEngaged={engaged}
          className={styles.cardAction}
          onEngaged={onEngaged}
          projectId={project.projectId}
          projectName={project.name}
        />
      ) : (
        <p className={styles.sampleNote}>
          Sign in as a financier to express interest in a live project.
        </p>
      )}
    </article>
  );
}

function distinctProjectTypes(
  projects: readonly PortfolioProject[],
): readonly string[] {
  const types = new Set<string>();
  for (const project of projects) {
    if (project.projectType !== null) types.add(project.projectType);
  }
  return [...types].sort();
}

function mergeProjectTypes(
  known: readonly string[],
  incoming: readonly string[],
): readonly string[] {
  return [...new Set([...known, ...incoming])].sort();
}

/** Only used for the sample, which no server is filtering. */
function filterLocally(
  projects: readonly PortfolioProject[],
  filters: PortfolioFilters,
): readonly PortfolioProject[] {
  return projects.filter((project) => {
    if (
      filters.stages.length > 0 &&
      !filters.stages.includes(project.stage)
    ) {
      return false;
    }
    if (
      filters.viability !== null &&
      project.viabilityStatus !== filters.viability
    ) {
      return false;
    }
    if (
      filters.projectType !== null &&
      project.projectType !== filters.projectType
    ) {
      return false;
    }
    return true;
  });
}
