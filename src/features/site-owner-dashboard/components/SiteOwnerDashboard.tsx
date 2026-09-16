"use client";

import { useMemo, useRef, useState, type SVGProps } from "react";
import {
  DASHBOARD_LOCATIONS,
  MAX_SELECTED_LOCATIONS,
  RETURN_POINTS,
  type DashboardLocation,
} from "../model/mockDashboard";
import styles from "./SiteOwnerDashboard.module.css";

const CHART_WIDTH = 560;
const CHART_HEIGHT = 360;
const CHART_LEFT = 48;
const CHART_RIGHT = 16;
const CHART_TOP = 16;
const CHART_BOTTOM = 44;
const CHART_MAX_DOLLARS = 120000;
const DEFAULT_SELECTED_IDS = DASHBOARD_LOCATIONS.filter(
  (location) => location.selectedByDefault,
).map((location) => location.id);

function locationSetSignature(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

function Icon({
  children,
  ...props
}: SVGProps<SVGSVGElement> & { readonly children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="1em"
      viewBox="0 0 16 16"
      width="1em"
      {...props}
    >
      {children}
    </svg>
  );
}

function LocationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path
        d="M8 14s4.5-4.2 4.5-8A4.5 4.5 0 0 0 3.5 6c0 3.8 4.5 8 4.5 8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <circle cx="8" cy="6" r="1.55" stroke="currentColor" strokeWidth="1.5" />
    </Icon>
  );
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m10.25 10.25 3 3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </Icon>
  );
}

function TrendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path
        d="m2 11 4-4 2.5 2.5L14 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M10.5 4H14v3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </Icon>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function chartX(index: number): number {
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  return CHART_LEFT + (plotWidth * index) / (RETURN_POINTS.length - 1);
}

function chartY(value: number, chartMaxDollars = CHART_MAX_DOLLARS): number {
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  return (
    CHART_TOP +
    plotHeight -
    (Math.min(value, chartMaxDollars) / chartMaxDollars) * plotHeight
  );
}

function seriesPoints(
  selectValue: (point: (typeof RETURN_POINTS)[number]) => number,
  scale: number,
  chartMaxDollars: number,
): string {
  return RETURN_POINTS.map(
    (point, index) =>
      `${chartX(index)},${chartY(
        selectValue(point) * scale,
        chartMaxDollars,
      )}`,
  ).join(" ");
}

interface RoiChartProps {
  readonly individualTotal: number;
  readonly communityTotal: number;
}

function RoiChart({ individualTotal, communityTotal }: RoiChartProps) {
  const chartMaxDollars = Math.max(
    CHART_MAX_DOLLARS,
    Math.ceil(Math.max(individualTotal, communityTotal) / 30000) * 30000,
  );
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => chartMaxDollars - (chartMaxDollars / 4) * index,
  );
  const individualPoints = seriesPoints(
    (point) => point.individualDollars,
    individualTotal / 70000,
    chartMaxDollars,
  );
  const communityPoints = seriesPoints(
    (point) => point.communityDollars,
    communityTotal / 108000,
    chartMaxDollars,
  );
  const communityAreaPoints = `${communityPoints} ${chartX(
    RETURN_POINTS.length - 1,
  )},${chartY(0, chartMaxDollars)} ${chartX(0)},${chartY(
    0,
    chartMaxDollars,
  )}`;

  return (
    <figure className={styles.chartFigure}>
      <svg
        aria-labelledby="roi-chart-title roi-chart-description"
        className={styles.chart}
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <title id="roi-chart-title">
          Illustrative cumulative returns over 20 years
        </title>
        <desc id="roi-chart-description">
          The illustrative comparison reaches {formatCurrency(individualTotal)}
          for individual solar and {formatCurrency(communityTotal)} for
          community solar in year twenty. These are mock values, not a forecast.
        </desc>

        {yTicks.map((tick) => {
          const y = chartY(tick, chartMaxDollars);
          return (
            <g key={tick}>
              <line
                className={styles.gridLine}
                x1={CHART_LEFT}
                x2={CHART_WIDTH - CHART_RIGHT}
                y1={y}
                y2={y}
              />
              <text
                className={styles.axisLabel}
                textAnchor="end"
                x={CHART_LEFT - 8}
                y={y + 4}
              >
                {tick === 0
                  ? "$0"
                  : `$${Number((tick / 1000).toFixed(1))}k`}
              </text>
            </g>
          );
        })}

        {RETURN_POINTS.map((point, index) => (
          <g key={point.year}>
            <line
              className={styles.verticalGridLine}
              x1={chartX(index)}
              x2={chartX(index)}
              y1={CHART_TOP}
              y2={chartY(0, chartMaxDollars)}
            />
            <text
              className={styles.axisLabel}
              textAnchor="middle"
              x={chartX(index)}
              y={CHART_HEIGHT - 18}
            >
              Y{point.year}
            </text>
          </g>
        ))}

        <polygon
          className={styles.communityArea}
          points={communityAreaPoints}
        />
        <polyline
          className={styles.individualLine}
          points={individualPoints}
        />
        <polyline
          className={styles.communityLine}
          points={communityPoints}
        />
      </svg>

      <figcaption className={styles.chartCaption}>
        <span className={styles.legendItem}>
          <span className={styles.individualKey} />
          Individual solar
        </span>
        <span className={styles.legendItem}>
          <span className={styles.communityKey} />
          Community solar
        </span>
      </figcaption>
    </figure>
  );
}

export function SiteOwnerDashboard() {
  const searchRef = useRef<HTMLInputElement>(null);
  const customLocationSequence = useRef(0);
  const [query, setQuery] = useState("");
  const [locations, setLocations] =
    useState<readonly DashboardLocation[]>(DASHBOARD_LOCATIONS);
  const [selectedIds, setSelectedIds] =
    useState<readonly string[]>(DEFAULT_SELECTED_IDS);
  const [announcement, setAnnouncement] = useState("");
  const [simulation, setSimulation] = useState({
    individualTotal: 70000,
    communityTotal: 108000,
    modeledLocationCount: 3,
    excludedDraftCount: 0,
    includedLocationIds: DEFAULT_SELECTED_IDS,
    excludedLocationIds: [] as readonly string[],
  });

  const filteredLocations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return locations;

    return locations.filter((location) =>
      [
        location.address,
        location.locality,
        location.propertyType,
        location.areaSquareFeet === null ? "" : `${location.areaSquareFeet}`,
      ].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [locations, query]);

  const toggleLocation = (locationId: string) => {
    const location = locations.find(
      (candidate) => candidate.id === locationId,
    );
    if (!location) return;

    setSelectedIds((current) => {
      if (current.includes(locationId)) {
        const next = current.filter((id) => id !== locationId);
        setAnnouncement(
          `${location.address} removed. ${next.length} locations selected.`,
        );
        return next;
      }

      if (current.length >= MAX_SELECTED_LOCATIONS) {
        setAnnouncement(
          `Choose no more than ${MAX_SELECTED_LOCATIONS} locations.`,
        );
        return current;
      }

      const next = [...current, locationId];
      setAnnouncement(
        `${location.address} selected. ${next.length} locations selected.`,
      );
      return next;
    });
  };

  const addLocation = () => {
    const address = query.trim();

    if (address.length === 0) {
      searchRef.current?.focus();
      setAnnouncement("Enter an address before adding a location.");
      return;
    }

    const existing = locations.find(
      (location) => location.address.toLowerCase() === address.toLowerCase(),
    );

    if (existing) {
      if (selectedIds.includes(existing.id)) {
        setAnnouncement(`${existing.address} is already selected.`);
      } else {
        toggleLocation(existing.id);
      }
      setQuery("");
      return;
    }

    if (selectedIds.length >= MAX_SELECTED_LOCATIONS) {
      setAnnouncement(
        `Choose no more than ${MAX_SELECTED_LOCATIONS} locations. Remove one before adding another address.`,
      );
      return;
    }

    customLocationSequence.current += 1;
    const customLocation: DashboardLocation = {
      id: `custom-location-${customLocationSequence.current}`,
      address,
      shortLabel: address,
      locality: "Location pending validation",
      propertyType: "Property details pending",
      areaSquareFeet: null,
      individualReturnDollars: null,
      communityReturnDollars: null,
      selectedByDefault: false,
      mapPosition: null,
    };

    setLocations((current) => [customLocation, ...current]);
    setSelectedIds((current) => [...current, customLocation.id]);
    setQuery("");
    setAnnouncement(
      `${address} added as a draft location. Its map position and property details are pending validation.`,
    );
  };

  const runSimulation = () => {
    const selected = locations.filter((location) =>
      selectedIds.includes(location.id),
    );
    const modeled = selected.filter(
      (
        location,
      ): location is DashboardLocation & {
        readonly individualReturnDollars: number;
        readonly communityReturnDollars: number;
      } =>
        location.individualReturnDollars !== null &&
        location.communityReturnDollars !== null,
    );

    if (modeled.length === 0) {
      setAnnouncement(
        "Select at least one predefined location with illustrative model data.",
      );
      return;
    }

    const individualTotal = modeled.reduce(
      (total, location) => total + location.individualReturnDollars,
      0,
    );
    const communityTotal = modeled.reduce(
      (total, location) => total + location.communityReturnDollars,
      0,
    );
    const excludedDraftCount = selected.length - modeled.length;
    const modeledLocationIds = new Set(
      modeled.map((location) => location.id),
    );

    setSimulation({
      individualTotal,
      communityTotal,
      modeledLocationCount: modeled.length,
      excludedDraftCount,
      includedLocationIds: modeled.map((location) => location.id),
      excludedLocationIds: selected
        .filter((location) => !modeledLocationIds.has(location.id))
        .map((location) => location.id),
    });
    setAnnouncement(
      `Illustrative simulation updated using ${modeled.length} modeled ${
        modeled.length === 1 ? "location" : "locations"
      }.${
        excludedDraftCount > 0
          ? ` ${excludedDraftCount} unvalidated draft ${
              excludedDraftCount === 1 ? "was" : "were"
            } excluded.`
          : ""
      }`,
    );
  };

  const selectedModeledLocationCount = locations.filter(
    (location) =>
      selectedIds.includes(location.id) &&
      location.individualReturnDollars !== null &&
      location.communityReturnDollars !== null,
  ).length;
  const latestSimulationLocationIds = [
    ...simulation.includedLocationIds,
    ...simulation.excludedLocationIds,
  ];
  const selectionNeedsSimulation =
    locationSetSignature(selectedIds) !==
    locationSetSignature(latestSimulationLocationIds);
  const illustrativeDifference =
    simulation.individualTotal === 0
      ? 0
      : Math.round(
          ((simulation.communityTotal - simulation.individualTotal) /
            simulation.individualTotal) *
            100,
        );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Site owner workspace</p>
          <h1 className={styles.pageTitle}>Explore a community solar scenario</h1>
          <p className={styles.pageDescription}>
            Compare locations and review the supplied dashboard concept. Values
            on this page are illustrative mock data and are not a financial,
            engineering, or eligibility assessment.
          </p>
        </div>
      </header>

      <p aria-live="polite" className={styles.visuallyHidden}>
        {announcement}
      </p>

      <div className={styles.dashboardGrid}>
        <section aria-labelledby="location-heading" className={styles.panel}>
          <div className={styles.panelHeading}>
            <LocationIcon className={styles.headingIcon} />
            <h2 id="location-heading">Location selection</h2>
          </div>

          <form
            className={styles.search}
            id="location-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              addLocation();
            }}
          >
            <label className={styles.visuallyHidden} htmlFor="location-search">
              Search address, neighborhood, or property type
            </label>
            <SearchIcon className={styles.searchIcon} />
            <input
              id="location-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search or enter an address..."
              ref={searchRef}
              type="search"
              value={query}
            />
          </form>

          <div className={styles.map} role="group" aria-label="Location map">
            <div className={styles.mapGrid} aria-hidden="true" />
            <div className={styles.mapCenter} aria-hidden="true">
              <LocationIcon />
              <span>Interactive map</span>
              <small>Select a marker or location card</small>
            </div>
            {locations.map((location) => {
              if (location.mapPosition === null) return null;
              const selected = selectedIds.includes(location.id);
              const tooltipId = `${location.id}-map-tooltip`;
              const tooltipPosition =
                location.mapPosition.xPercent <= 25
                  ? styles.markerTooltipStart
                  : location.mapPosition.xPercent >= 75
                    ? styles.markerTooltipEnd
                    : undefined;
              const tooltipVerticalPosition =
                location.mapPosition.yPercent <= 35
                  ? styles.markerTooltipBelow
                  : undefined;
              const tooltipClasses = [
                styles.markerTooltip,
                tooltipPosition,
                tooltipVerticalPosition,
              ]
                .filter((className): className is string =>
                  Boolean(className),
                )
                .join(" ");

              return (
                <button
                  aria-describedby={tooltipId}
                  aria-label={`${selected ? "Remove" : "Select"} ${location.address}`}
                  aria-pressed={selected}
                  className={
                    selected
                      ? `${styles.mapMarker} ${styles.mapMarkerSelected}`
                      : styles.mapMarker
                  }
                  key={location.id}
                  onClick={() => toggleLocation(location.id)}
                  style={{
                    left: `${location.mapPosition.xPercent}%`,
                    top: `${location.mapPosition.yPercent}%`,
                  }}
                  type="button"
                >
                  <span aria-hidden="true" className={styles.markerDot} />
                  <span
                    className={tooltipClasses}
                    id={tooltipId}
                    role="tooltip"
                  >
                    <strong>{location.address}</strong>
                    <small>{location.locality}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.selectionToolbar}>
            <p>
              {selectedIds.length} selected · maximum {MAX_SELECTED_LOCATIONS}
            </p>
            <button
              className={styles.addButton}
              onClick={addLocation}
              type="button"
            >
              <span aria-hidden="true">+</span> Add location
            </button>
          </div>

          <div
            aria-label="Available locations"
            className={styles.locationList}
            role="region"
            tabIndex={0}
          >
            {filteredLocations.length > 0 ? (
              filteredLocations.map((location) => {
                const selected = selectedIds.includes(location.id);
                return (
                  <label
                    className={
                      selected
                        ? `${styles.locationCard} ${styles.locationCardSelected}`
                        : styles.locationCard
                    }
                    key={location.id}
                  >
                    <input
                      checked={selected}
                      onChange={() => toggleLocation(location.id)}
                      type="checkbox"
                    />
                    <span className={styles.locationIndicator}>
                      <LocationIcon />
                    </span>
                    <span className={styles.locationText}>
                      <strong>{location.address}</strong>
                      <span>
                        {location.locality} · {location.propertyType} ·{" "}
                        {location.areaSquareFeet === null
                          ? "Area pending"
                          : `${location.areaSquareFeet.toLocaleString("en-US")} sq ft`}
                      </span>
                    </span>
                  </label>
                );
              })
            ) : (
              <p className={styles.emptySearch}>
                No mock locations match “{query}”. Use Add location to create a
                local draft.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="roi-heading" className={styles.panel}>
          <div className={styles.roiHeader}>
            <div className={styles.panelHeading}>
              <TrendIcon className={styles.headingIcon} />
              <h2 id="roi-heading">ROI analysis</h2>
            </div>
            <button
              className={styles.simulationButton}
              disabled={selectedModeledLocationCount === 0}
              onClick={runSimulation}
              title={
                selectedModeledLocationCount === 0
                  ? "Select a predefined location with illustrative model data"
                  : "Run the illustrative mock comparison"
              }
              type="button"
            >
              Run simulation
            </button>
          </div>

          <p className={styles.modelNotice}>
            Illustrative values supplied by the design mockup. Results currently
            include {simulation.modeledLocationCount} modeled{" "}
            {simulation.modeledLocationCount === 1 ? "location" : "locations"}
            {simulation.excludedDraftCount > 0
              ? ` and exclude ${simulation.excludedDraftCount} unvalidated draft ${
                  simulation.excludedDraftCount === 1
                    ? "location"
                    : "locations"
                }`
              : ""}
            . No accepted financial model is connected.
          </p>
          {selectionNeedsSimulation ? (
            <p className={styles.staleNotice}>
              Location selections changed. Run simulation to update the ROI and
              included comparison cards.
            </p>
          ) : null}

          <dl aria-live="polite" className={styles.metrics}>
            <div>
              <dt>20-year individual</dt>
              <dd className={styles.individualValue}>
                {formatCurrency(simulation.individualTotal)}
              </dd>
            </div>
            <div>
              <dt>20-year community</dt>
              <dd className={styles.communityValue}>
                {formatCurrency(simulation.communityTotal)}
              </dd>
            </div>
            <div>
              <dt>Illustrative difference</dt>
              <dd className={styles.communityValue}>
                +{illustrativeDifference}%
              </dd>
            </div>
          </dl>

          <RoiChart
            communityTotal={simulation.communityTotal}
            individualTotal={simulation.individualTotal}
          />
        </section>
      </div>

      <section
        aria-labelledby="allocation-heading"
        className={`${styles.panel} ${styles.allocationSection}`}
      >
        <div className={styles.allocationHeading}>
          <div>
            <p className={styles.eyebrow}>Location comparison</p>
            <h2 id="allocation-heading">Latest ROI location breakdown</h2>
          </div>
          <p>Included card values add to the ROI totals above.</p>
        </div>

        <div
          aria-label="Location comparison cards"
          className={styles.allocationGrid}
          role="region"
          tabIndex={0}
        >
          {locations.map((location) => {
            const hasReturns =
              location.individualReturnDollars !== null &&
              location.communityReturnDollars !== null;
            const included = simulation.includedLocationIds.includes(
              location.id,
            );
            const excluded = simulation.excludedLocationIds.includes(
              location.id,
            );
            const difference = hasReturns
              ? location.communityReturnDollars -
                location.individualReturnDollars
              : null;
            const status = included
              ? "Included in latest simulation"
              : excluded
                ? "Pending validation — excluded from latest simulation"
                : "Not included in latest simulation";

            return (
              <article
                className={`${styles.allocationCard} ${
                  included
                    ? styles.allocationCardIncluded
                    : styles.allocationCardExcluded
                }`}
                key={location.id}
              >
                <h3>
                  <LocationIcon />
                  {location.shortLabel}
                </h3>
                <p
                  className={
                    included
                      ? styles.comparisonStatusIncluded
                      : styles.comparisonStatus
                  }
                >
                  {status}
                </p>
                {hasReturns && difference !== null ? (
                  <dl>
                    <div>
                      <dt>20-year individual</dt>
                      <dd className={styles.individualValue}>
                        {formatCurrency(location.individualReturnDollars)}
                      </dd>
                    </div>
                    <div>
                      <dt>20-year community</dt>
                      <dd className={styles.communityValue}>
                        {formatCurrency(location.communityReturnDollars)}
                      </dd>
                    </div>
                    <div className={styles.gainRow}>
                      <dt>Difference</dt>
                      <dd className={styles.communityValue}>
                        +{formatCurrency(difference)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className={styles.comparisonPending}>
                    Comparison pending location validation.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
