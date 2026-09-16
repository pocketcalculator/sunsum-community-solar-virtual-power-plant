/**
 * `ProjectStore` backed by PostgreSQL.
 *
 * The point of the seam: `core` keeps asking for `listProjects()` and does not
 * learn that a database exists. `mockProjectStore` and this class are
 * interchangeable, and `seed.sql` holds the same five projects the mock does, so
 * `GET /portfolio` returns byte-identical responses either way. If it does not,
 * one of the two is wrong — which is a test, not a coincidence.
 *
 * A `ProjectRecord` spans three tables. The project and its site are a plain
 * join; the assessment estimates come from the most recent assessment for that
 * site, because assessments are append-only and a re-run writes a new row rather
 * than editing the old one; and the open funding-need count is a count of rows
 * rather than a stored number, so it cannot drift as needs are funded.
 *
 * Everything happens in one statement. The alternative — a query per project to
 * fetch its assessment, and another for its needs — is the N+1 that makes a
 * list endpoint slow as soon as the pipeline is real.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import type { ProjectRecord, ProjectStore, ProjectStage } from "@/backend/core/projects";

import { getDb, type Database } from "./client";
import { assessments, fundingNeeds, projects, sites } from "./schema";

/**
 * PostgreSQL returns `numeric` as a string, deliberately: the type holds values
 * no IEEE double can represent, so the driver refuses to lose precision on your
 * behalf. `ProjectRecord` declares these as numbers, so the conversion happens
 * here, at the boundary, rather than leaking strings into the domain.
 *
 * Money never takes this path. Amounts stay `numeric` end to end.
 */
function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** A column the schema allows to be null, on a row where the domain requires a value. */
function required<T>(value: T | null, column: string, projectId: string): T {
  if (value === null) {
    throw new Error(
      `Project ${projectId} has no ${column}. A project only exists on an accepted site, ` +
        `and an accepted site must be complete, so this row contradicts ` +
        `sites_complete_once_submitted_check.`,
    );
  }

  return value;
}

export class PostgresProjectStore implements ProjectStore {
  constructor(private readonly db: Database = getDb()) {}

  async listProjects(): Promise<readonly ProjectRecord[]> {
    /**
     * The newest assessment per site. `DISTINCT ON` is PostgreSQL's way of
     * saying "one row per site, the first after this ordering" — a window
     * function would need a second pass to filter on the rank.
     */
    const latestAssessment = this.db
      .selectDistinctOn([assessments.siteId], {
        siteId: assessments.siteId,
        preliminaryProjectType: assessments.preliminaryProjectType,
        viabilityStatus: assessments.viabilityStatus,
        estimatedSystemSizeKwLow: assessments.estimatedSystemSizeKwLow,
        estimatedSystemSizeKwHigh: assessments.estimatedSystemSizeKwHigh,
        estimatedAnnualGenerationKwhLow: assessments.estimatedAnnualGenerationKwhLow,
        estimatedAnnualGenerationKwhHigh: assessments.estimatedAnnualGenerationKwhHigh,
      })
      .from(assessments)
      .orderBy(assessments.siteId, desc(assessments.createdAt))
      .as("latest_assessment");

    const rows = await this.db
      .select({
        id: projects.id,
        siteId: projects.siteId,
        name: projects.name,
        stage: projects.stage,
        visibleToInvestors: projects.visibleToInvestors,
        estimatedCapacityKw: projects.estimatedCapacityKw,
        siteAddressRaw: sites.addressRaw,
        siteLatitude: sites.latitude,
        siteLongitude: sites.longitude,
        ownerUserId: sites.ownerUserId,
        locality: sites.locality,
        region: sites.region,
        siteType: sites.siteType,
        preliminaryProjectType: latestAssessment.preliminaryProjectType,
        viabilityStatus: latestAssessment.viabilityStatus,
        estimatedSystemSizeKwLow: latestAssessment.estimatedSystemSizeKwLow,
        estimatedSystemSizeKwHigh: latestAssessment.estimatedSystemSizeKwHigh,
        estimatedAnnualGenerationKwhLow: latestAssessment.estimatedAnnualGenerationKwhLow,
        estimatedAnnualGenerationKwhHigh: latestAssessment.estimatedAnnualGenerationKwhHigh,
        openFundingNeedsCount: this.db
          .$count(fundingNeeds, and(eq(fundingNeeds.projectId, projects.id), eq(fundingNeeds.status, "open")))
          .as("open_funding_needs_count"),
      })
      .from(projects)
      .innerJoin(sites, eq(sites.id, projects.siteId))
      .leftJoin(latestAssessment, eq(latestAssessment.siteId, projects.siteId))
      /** Stable output. Without it PostgreSQL may return rows in any order. */
      .orderBy(sql`${projects.createdAt}`, projects.id);

    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      stage: row.stage as ProjectStage,
      visibleToInvestors: row.visibleToInvestors,

      siteAddressRaw: required(row.siteAddressRaw, "address", row.id),
      siteLatitude: required(toNumber(row.siteLatitude), "latitude", row.id),
      siteLongitude: required(toNumber(row.siteLongitude), "longitude", row.id),
      ownerUserId: row.ownerUserId,

      locality: required(row.locality, "locality", row.id),
      region: required(row.region, "region", row.id),

      siteType: required(row.siteType, "site type", row.id),
      preliminaryProjectType: row.preliminaryProjectType,
      /**
       * A project with no assessment is a real possibility — an operator can
       * accept a site the screening service never scored — and the honest
       * answer is that more information is required, not a guess at viability.
       */
      viabilityStatus: row.viabilityStatus ?? "more_information_required",

      estimatedSystemSizeKwLow: toNumber(row.estimatedSystemSizeKwLow),
      estimatedSystemSizeKwHigh: toNumber(row.estimatedSystemSizeKwHigh),
      estimatedAnnualGenerationKwhLow: toNumber(row.estimatedAnnualGenerationKwhLow),
      estimatedAnnualGenerationKwhHigh: toNumber(row.estimatedAnnualGenerationKwhHigh),

      estimatedCapacityKw: toNumber(row.estimatedCapacityKw),
      openFundingNeedsCount: Number(row.openFundingNeedsCount),
    }));
  }
}

/** The store the handler uses when `SUNSUM_STORE=db`. */
export const postgresProjectStore: ProjectStore = new Proxy({} as ProjectStore, {
  /**
   * Lazy on purpose. Building the store opens a pool, and this module is
   * imported by the store selector whether or not `SUNSUM_STORE=db`, so an
   * eager instance would demand a `DATABASE_URL` from anyone running on the
   * mock — including CI, which has no database.
   *
   * Reading a method therefore hands back a wrapper and builds nothing: the
   * store is constructed when a query is actually made. Constructing inside the
   * trap instead would make merely touching this object — a type check, a log
   * line, a test comparing it against the mock — fail without a connection
   * string, which is the opposite of what lazy is for.
   *
   * The wrapper is `async` so that a missing `DATABASE_URL` arrives as a
   * rejected promise. Every `ProjectStore` method is typed as returning one, so
   * throwing synchronously would escape a caller's `.catch()`.
   */
  get(_target, property: keyof ProjectStore) {
    return async (...args: readonly unknown[]) => {
      const store = new PostgresProjectStore();
      return (store[property] as (...a: readonly unknown[]) => unknown)(...args);
    };
  },
});
