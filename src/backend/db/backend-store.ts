/**
 * `BackendStore` backed by PostgreSQL.
 *
 * The point of the seam: `core` keeps asking a `BackendStore` for records and
 * does not learn that a database exists. `demoBackendStore` (in memory) and this
 * class are interchangeable, and `seed.sql` holds the same five projects the
 * mock does, so every endpoint returns byte-identical responses either way. If
 * it does not, one of the two is wrong — which is a test, not a coincidence.
 *
 * `MemoryBackendStore` is the behavioural oracle. Where its semantics are
 * surprising — activity read across the site/project parent boundary, an
 * engagement lookup that takes the newest match, a transaction that rolls back
 * on a failed `Result` rather than only on a throw — they are reproduced here
 * deliberately and noted at the method.
 *
 * A `ProjectRecord` spans three tables. The project and its site are a plain
 * join; the assessment estimates come from the most recent assessment for that
 * site, because assessments are append-only and a re-run writes a new row rather
 * than editing the old one; and the open funding-need count is a count of rows
 * rather than a stored number, so it cannot drift as needs are funded. All of it
 * happens in one statement — the alternative, a query per project for its
 * assessment and another for its needs, is the N+1 that makes a list endpoint
 * slow as soon as the pipeline is real.
 */

import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";

import type { ActivityRecord } from "@/backend/core/activity";
import { normalizeDocType } from "@/backend/core/documents";
import type { EngagementRecord, FundingNeedRecord } from "@/backend/core/engagements";
import type { InvestorProfile } from "@/backend/core/identity";
import type { ProjectRecord, ProjectStage, SiteType } from "@/backend/core/projects";
import { isFailedResult } from "@/backend/core/shared";
import type {
  AcknowledgementRecord,
  AssessmentRecord,
  DocumentRecord,
  SiteRecord,
  UserRecord,
} from "@/backend/core/sites";
import type { BackendStore } from "@/backend/core/store";

import { getDb, type Database } from "./client";
import {
  acknowledgements,
  activity,
  assessments,
  documents,
  fundingNeeds,
  investorEngagements,
  investors,
  projects,
  sites,
  users,
} from "./schema";

/**
 * A transaction behaves exactly like the database for every statement this
 * store issues, so the class takes either and the nested store built inside
 * `transaction()` needs no separate implementation.
 */
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

/**
 * PostgreSQL returns `numeric` as a string, deliberately: the type holds values
 * no IEEE double can represent, so the driver refuses to lose precision on your
 * behalf. The domain records declare these as numbers, so the conversion happens
 * here, at the boundary, rather than leaking strings into the domain.
 */
function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** The inverse, for writes. `numeric` columns are written as strings. */
function toNumericString(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** Timestamps arrive as `Date` and live in the domain as ISO-8601 strings. */
function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toDate(value: string | null | undefined): Date | null {
  return value === null || value === undefined ? null : new Date(value);
}

/**
 * `investment_objectives`, `impact_priorities`, `decision_criteria` and
 * `visible_portfolio_scope` default to `'{}'::jsonb` — an empty *object*, not an
 * empty array — and carry no `jsonb_typeof = 'array'` check, unlike
 * `geographies` and `funding_stage_focus` which do. A row written by hand or by
 * seed can therefore hold a non-array where the domain declares `string[]`.
 * Reading it as an array anyway would put an object where every caller spreads
 * or iterates, so a non-array is read as empty.
 */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

/**
 * The columns a `ProjectRecord` is assembled from. Shared by the list and the
 * two single-row reads so they cannot drift apart.
 */
const PROJECT_COLUMNS = {
  id: projects.id,
  siteId: projects.siteId,
  name: projects.name,
  stage: projects.stage,
  visibleToInvestors: projects.visibleToInvestors,
  estimatedCapacityKw: projects.estimatedCapacityKw,
  assignedOperatorUserId: projects.assignedOperatorUserId,
  nextAction: projects.nextAction,
  targetDate: projects.targetDate,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  siteAddressRaw: sites.addressRaw,
  siteLatitude: sites.latitude,
  siteLongitude: sites.longitude,
  ownerUserId: sites.ownerUserId,
  locality: sites.locality,
  region: sites.region,
  siteType: sites.siteType,
} as const;

/**
 * What `core` itself uses when a site has not been geocoded, copied from the
 * accept workflow rather than invented here: `workflows.ts` builds a project
 * with `site.latitude ?? 0`, `locality: "Location withheld"` and `region: ""`.
 *
 * An earlier version threw on a null instead, reasoning that an accepted site
 * must be complete. `sites_complete_once_submitted_check` guarantees that only
 * for the address, site type and ownership status; the coordinates and the
 * geocoder's locality and region are not covered, and nothing on the write path
 * populates them, so every project created through the API raised a 500 on the
 * first read. The domain already treats these as optional — `region === ""`
 * means "no geographic limit" to the mandate matcher, and the portfolio view
 * renders an empty locality as "Location withheld" — so the honest mapping is a
 * default, not an exception.
 */
const PROJECT_FALLBACK = {
  locality: "Location withheld",
  region: "",
  addressRaw: "",
  coordinate: 0,
  siteType: "rooftop",
} as const;

export class PostgresBackendStore implements BackendStore {
  constructor(private readonly db: Executor = getDb()) {}

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  /**
   * The memory store hands out a counter. Here the row is the authority and a
   * random v4 is enough; the prefix is advisory in both, which is why neither
   * reads it.
   */
  nextId(prefix: string): string {
    void prefix;
    return randomUUID();
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (row === undefined) return null;

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  listProjects(): Promise<readonly ProjectRecord[]> {
    return this.selectProjects();
  }

  async getProject(id: string): Promise<ProjectRecord | null> {
    const rows = await this.selectProjects(eq(projects.id, id));
    return rows[0] ?? null;
  }

  async getProjectBySite(siteId: string): Promise<ProjectRecord | null> {
    const rows = await this.selectProjects(eq(projects.siteId, siteId));
    return rows[0] ?? null;
  }

  private async selectProjects(where?: SQL): Promise<readonly ProjectRecord[]> {
    /**
     * The newest assessment per site. `DISTINCT ON` is PostgreSQL's way of
     * saying "one row per site, the first after this ordering" — a window
     * function would need a second pass to filter on the rank.
     *
     * `id` is the tie-breaker, and it is not decoration. `now()` is fixed for
     * the whole transaction, so two assessments inserted by one workflow carry
     * the same `created_at` and the ordering alone leaves which of them wins to
     * the planner — an override could lose to the assessment it overrode,
     * differently on different runs.
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
      .orderBy(assessments.siteId, desc(assessments.createdAt), desc(assessments.id))
      .as("latest_assessment");

    const rows = await this.db
      .select({
        ...PROJECT_COLUMNS,
        preliminaryProjectType: latestAssessment.preliminaryProjectType,
        viabilityStatus: latestAssessment.viabilityStatus,
        estimatedSystemSizeKwLow: latestAssessment.estimatedSystemSizeKwLow,
        estimatedSystemSizeKwHigh: latestAssessment.estimatedSystemSizeKwHigh,
        estimatedAnnualGenerationKwhLow: latestAssessment.estimatedAnnualGenerationKwhLow,
        estimatedAnnualGenerationKwhHigh: latestAssessment.estimatedAnnualGenerationKwhHigh,
        openFundingNeedsCount: this.db
          .$count(
            fundingNeeds,
            and(eq(fundingNeeds.projectId, projects.id), eq(fundingNeeds.status, "open")),
          )
          .as("open_funding_needs_count"),
      })
      .from(projects)
      .innerJoin(sites, eq(sites.id, projects.siteId))
      .leftJoin(latestAssessment, eq(latestAssessment.siteId, projects.siteId))
      .where(where)
      /** Stable output. Without it PostgreSQL may return rows in any order. */
      .orderBy(asc(projects.createdAt), asc(projects.id));

    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      stage: row.stage as ProjectStage,
      visibleToInvestors: row.visibleToInvestors,

      siteAddressRaw: row.siteAddressRaw ?? PROJECT_FALLBACK.addressRaw,
      siteLatitude: toNumber(row.siteLatitude) ?? PROJECT_FALLBACK.coordinate,
      siteLongitude: toNumber(row.siteLongitude) ?? PROJECT_FALLBACK.coordinate,
      ownerUserId: row.ownerUserId,

      locality: row.locality ?? PROJECT_FALLBACK.locality,
      region: row.region ?? PROJECT_FALLBACK.region,

      siteType: (row.siteType ?? PROJECT_FALLBACK.siteType) as SiteType,
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

      assignedOperatorUserId: row.assignedOperatorUserId,
      nextAction: row.nextAction,
      targetDate: toIso(row.targetDate),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async addProject(project: ProjectRecord): Promise<void> {
    /**
     * `locality`, `region` and the site details on the record are read through
     * the join from `sites`; they have no column here. Writing them would mean
     * a project row that can disagree with its own site.
     */
    await this.db.insert(projects).values({
      id: project.id,
      siteId: project.siteId,
      name: project.name,
      assignedOperatorUserId: project.assignedOperatorUserId ?? null,
      stage: project.stage,
      estimatedCapacityKw: toNumericString(project.estimatedCapacityKw),
      nextAction: project.nextAction ?? null,
      targetDate: toDate(project.targetDate),
      visibleToInvestors: project.visibleToInvestors,
      ...(project.createdAt === undefined ? {} : { createdAt: new Date(project.createdAt) }),
      ...(project.updatedAt === undefined ? {} : { updatedAt: new Date(project.updatedAt) }),
    });
  }

  async updateProject(project: ProjectRecord): Promise<void> {
    await this.db
      .update(projects)
      .set({
        name: project.name,
        assignedOperatorUserId: project.assignedOperatorUserId ?? null,
        stage: project.stage,
        estimatedCapacityKw: toNumericString(project.estimatedCapacityKw),
        nextAction: project.nextAction ?? null,
        targetDate: toDate(project.targetDate),
        visibleToInvestors: project.visibleToInvestors,
        updatedAt: toDate(project.updatedAt) ?? new Date(),
      })
      .where(eq(projects.id, project.id));
  }

  // -------------------------------------------------------------------------
  // Sites and assessments
  // -------------------------------------------------------------------------

  async getSite(id: string): Promise<SiteRecord | null> {
    const [row] = await this.db.select().from(sites).where(eq(sites.id, id)).limit(1);
    return row === undefined ? null : this.toSiteRecord(row);
  }

  async listSites(): Promise<readonly SiteRecord[]> {
    const rows = await this.db
      .select()
      .from(sites)
      .orderBy(asc(sites.createdAt), asc(sites.id));

    return rows.map((row) => this.toSiteRecord(row));
  }

  private toSiteRecord(row: typeof sites.$inferSelect): SiteRecord {
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      addressRaw: row.addressRaw,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      geocodeConfidence: toNumber(row.geocodeConfidence),
      siteType: row.siteType,
      ownershipStatus: row.ownershipStatus,
      approximateAreaSqm: toNumber(row.approximateAreaSqm),
      electricityUsageKwhAnnual: toNumber(row.electricityUsageKwhAnnual),
      electricityBillDocId: row.electricityBillDocId,
      hasExistingSolar: row.hasExistingSolar,
      consentGivenAt: toIso(row.consentGivenAt),
      submissionStatus: row.submissionStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async addSite(site: SiteRecord): Promise<void> {
    await this.db.insert(sites).values({
      id: site.id,
      ownerUserId: site.ownerUserId,
      addressRaw: site.addressRaw,
      latitude: toNumericString(site.latitude),
      longitude: toNumericString(site.longitude),
      geocodeConfidence: toNumericString(site.geocodeConfidence),
      siteType: site.siteType,
      ownershipStatus: site.ownershipStatus,
      approximateAreaSqm: toNumericString(site.approximateAreaSqm),
      electricityUsageKwhAnnual: toNumericString(site.electricityUsageKwhAnnual),
      electricityBillDocId: site.electricityBillDocId,
      hasExistingSolar: site.hasExistingSolar,
      consentGivenAt: toDate(site.consentGivenAt),
      submissionStatus: site.submissionStatus,
      createdAt: new Date(site.createdAt),
      updatedAt: new Date(site.updatedAt),
    });
  }

  /**
   * `locality` and `region` are absent from `SiteRecord` and so are left alone.
   * They are geocoder output that no domain write path produces; overwriting
   * them with "not present on the record" would erase seeded data on the first
   * status change.
   */
  async updateSite(site: SiteRecord): Promise<void> {
    await this.db
      .update(sites)
      .set({
        ownerUserId: site.ownerUserId,
        addressRaw: site.addressRaw,
        latitude: toNumericString(site.latitude),
        longitude: toNumericString(site.longitude),
        geocodeConfidence: toNumericString(site.geocodeConfidence),
        siteType: site.siteType,
        ownershipStatus: site.ownershipStatus,
        approximateAreaSqm: toNumericString(site.approximateAreaSqm),
        electricityUsageKwhAnnual: toNumericString(site.electricityUsageKwhAnnual),
        electricityBillDocId: site.electricityBillDocId,
        hasExistingSolar: site.hasExistingSolar,
        consentGivenAt: toDate(site.consentGivenAt),
        submissionStatus: site.submissionStatus,
        updatedAt: new Date(site.updatedAt),
      })
      .where(eq(sites.id, site.id));
  }

  async listAssessments(siteId: string): Promise<readonly AssessmentRecord[]> {
    const rows = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.siteId, siteId))
      /** Oldest first: `core` reads the current assessment as `.at(-1)`. */
      .orderBy(asc(assessments.createdAt), asc(assessments.id));

    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      rulesetVersion: row.rulesetVersion,
      inputsUsed: (row.inputsUsed ?? {}) as Readonly<Record<string, unknown>>,
      estimatedSystemSizeKwLow: toNumber(row.estimatedSystemSizeKwLow),
      estimatedSystemSizeKwHigh: toNumber(row.estimatedSystemSizeKwHigh),
      estimatedAnnualGenerationKwhLow: toNumber(row.estimatedAnnualGenerationKwhLow),
      estimatedAnnualGenerationKwhHigh: toNumber(row.estimatedAnnualGenerationKwhHigh),
      preliminaryProjectType: row.preliminaryProjectType,
      viabilityStatus: row.viabilityStatus,
      flags: toStringArray(row.flags),
      missingInformation: toStringArray(row.missingInformation),
      isOverride: row.isOverride,
      overrideReason: row.overrideReason,
      overriddenByUserId: row.overriddenByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Append-only by migration `0001`; there is no `updateAssessment`. */
  async addAssessment(assessment: AssessmentRecord): Promise<void> {
    await this.db.insert(assessments).values({
      id: assessment.id,
      siteId: assessment.siteId,
      rulesetVersion: assessment.rulesetVersion,
      inputsUsed: assessment.inputsUsed,
      estimatedSystemSizeKwLow: toNumericString(assessment.estimatedSystemSizeKwLow),
      estimatedSystemSizeKwHigh: toNumericString(assessment.estimatedSystemSizeKwHigh),
      estimatedAnnualGenerationKwhLow: toNumericString(
        assessment.estimatedAnnualGenerationKwhLow,
      ),
      estimatedAnnualGenerationKwhHigh: toNumericString(
        assessment.estimatedAnnualGenerationKwhHigh,
      ),
      preliminaryProjectType: assessment.preliminaryProjectType,
      viabilityStatus: assessment.viabilityStatus,
      flags: [...assessment.flags],
      missingInformation: [...assessment.missingInformation],
      isOverride: assessment.isOverride,
      overrideReason: assessment.overrideReason,
      overriddenByUserId: assessment.overriddenByUserId,
      createdAt: new Date(assessment.createdAt),
    });
  }

  // -------------------------------------------------------------------------
  // Activity
  // -------------------------------------------------------------------------

  /**
   * Activity rows carry exactly one parent — `activity_single_parent_check`
   * enforces it — so a project's history is split between rows parented to the
   * project and the pre-project rows parented to its site. Both readers join
   * across that boundary and sort by time, so a caller still sees one
   * continuous history without any row having to name two parents.
   */
  listActivity(projectId: string): Promise<readonly ActivityRecord[]> {
    const siteOfProject = this.db
      .select({ siteId: projects.siteId })
      .from(projects)
      .where(eq(projects.id, projectId));

    return this.selectActivity(
      or(eq(activity.projectId, projectId), inArray(activity.siteId, siteOfProject)),
    );
  }

  listSiteActivity(siteId: string): Promise<readonly ActivityRecord[]> {
    const projectOfSite = this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.siteId, siteId));

    return this.selectActivity(
      or(eq(activity.siteId, siteId), inArray(activity.projectId, projectOfSite)),
    );
  }

  private async selectActivity(where: SQL | undefined): Promise<readonly ActivityRecord[]> {
    const rows = await this.db
      .select()
      .from(activity)
      .where(where)
      /** Matches `sortedByCreatedAt`: time, then id as the tie-breaker. */
      .orderBy(asc(activity.createdAt), asc(activity.id));

    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      projectId: row.projectId,
      actorUserId: row.actorUserId,
      action: row.action,
      note: row.note,
      fromValue: row.fromValue,
      toValue: row.toValue,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Append-only by migration `0001`; an audit trail that can be edited is not one. */
  async addActivity(record: ActivityRecord): Promise<void> {
    await this.db.insert(activity).values({
      id: record.id,
      siteId: record.siteId,
      projectId: record.projectId,
      actorUserId: record.actorUserId,
      action: record.action,
      note: record.note,
      fromValue: record.fromValue,
      toValue: record.toValue,
      createdAt: new Date(record.createdAt),
    });
  }

  // -------------------------------------------------------------------------
  // Funding needs and engagements
  // -------------------------------------------------------------------------

  async getFundingNeed(id: string): Promise<FundingNeedRecord | null> {
    const [row] = await this.db
      .select()
      .from(fundingNeeds)
      .where(eq(fundingNeeds.id, id))
      .limit(1);

    return row === undefined ? null : this.toFundingNeedRecord(row);
  }

  async listFundingNeeds(projectId: string): Promise<readonly FundingNeedRecord[]> {
    const rows = await this.db
      .select()
      .from(fundingNeeds)
      .where(eq(fundingNeeds.projectId, projectId))
      .orderBy(asc(fundingNeeds.createdAt), asc(fundingNeeds.id));

    return rows.map((row) => this.toFundingNeedRecord(row));
  }

  private toFundingNeedRecord(row: typeof fundingNeeds.$inferSelect): FundingNeedRecord {
    return {
      id: row.id,
      projectId: row.projectId,
      needType: row.needType,
      stage: row.stage,
      description: row.description,
      amountRequested: toNumber(row.amountRequested),
      /** `NOT NULL DEFAULT '0'`: nothing committed is zero, not unknown. */
      amountCommitted: toNumber(row.amountCommitted) ?? 0,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async addFundingNeed(fundingNeed: FundingNeedRecord): Promise<void> {
    await this.db.insert(fundingNeeds).values({
      id: fundingNeed.id,
      projectId: fundingNeed.projectId,
      needType: fundingNeed.needType as typeof fundingNeeds.$inferInsert.needType,
      stage: fundingNeed.stage,
      description: fundingNeed.description,
      amountRequested: toNumericString(fundingNeed.amountRequested),
      amountCommitted: String(fundingNeed.amountCommitted),
      status: fundingNeed.status,
      createdAt: new Date(fundingNeed.createdAt),
    });
  }

  /**
   * `EngagementRecord.investorUserId` has no column: the user behind an
   * engagement is `investors.user_id`, and duplicating it here would let the two
   * disagree. Every read joins to recover it.
   */
  private engagementQuery() {
    return this.db
      .select({
        id: investorEngagements.id,
        investorId: investorEngagements.investorId,
        investorUserId: investors.userId,
        projectId: investorEngagements.projectId,
        fundingNeedId: investorEngagements.fundingNeedId,
        state: investorEngagements.state,
        stateChangedAt: investorEngagements.stateChangedAt,
        committedAmount: investorEngagements.committedAmount,
        commitmentInstrument: investorEngagements.commitmentInstrument,
        isBinding: investorEngagements.isBinding,
        declineReason: investorEngagements.declineReason,
        createdAt: investorEngagements.createdAt,
      })
      .from(investorEngagements)
      .innerJoin(investors, eq(investors.id, investorEngagements.investorId));
  }

  async listEngagements(projectId: string): Promise<readonly EngagementRecord[]> {
    const rows = await this.engagementQuery()
      .where(eq(investorEngagements.projectId, projectId))
      .orderBy(asc(investorEngagements.createdAt), asc(investorEngagements.id));

    return rows.map((row) => this.toEngagementRecord(row));
  }

  /**
   * Newest wins, matching the memory store's `findLast`. An investor who
   * declines and later re-engages has two rows for the same project and need —
   * the partial unique index permits exactly that — and the live one is the
   * most recent.
   */
  async findEngagement(
    investorId: string,
    projectId: string,
    fundingNeedId: string | null,
  ): Promise<EngagementRecord | null> {
    const [row] = await this.engagementQuery()
      .where(
        and(
          eq(investorEngagements.investorId, investorId),
          eq(investorEngagements.projectId, projectId),
          fundingNeedId === null
            ? isNull(investorEngagements.fundingNeedId)
            : eq(investorEngagements.fundingNeedId, fundingNeedId),
        ),
      )
      .orderBy(desc(investorEngagements.createdAt), desc(investorEngagements.id))
      .limit(1);

    return row === undefined ? null : this.toEngagementRecord(row);
  }

  private toEngagementRecord(row: {
    id: string;
    investorId: string;
    investorUserId: string;
    projectId: string;
    fundingNeedId: string | null;
    state: EngagementRecord["state"];
    stateChangedAt: Date;
    committedAmount: string | null;
    commitmentInstrument: string | null;
    isBinding: boolean;
    declineReason: string | null;
    createdAt: Date;
  }): EngagementRecord {
    return {
      id: row.id,
      investorId: row.investorId,
      investorUserId: row.investorUserId,
      projectId: row.projectId,
      fundingNeedId: row.fundingNeedId,
      state: row.state,
      stateChangedAt: row.stateChangedAt.toISOString(),
      committedAmount: toNumber(row.committedAmount),
      commitmentInstrument: row.commitmentInstrument,
      isBinding: row.isBinding,
      declineReason: row.declineReason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async addEngagement(engagement: EngagementRecord): Promise<void> {
    await this.db.insert(investorEngagements).values({
      id: engagement.id,
      investorId: engagement.investorId,
      projectId: engagement.projectId,
      fundingNeedId: engagement.fundingNeedId,
      state: engagement.state,
      stateChangedAt: new Date(engagement.stateChangedAt),
      committedAmount: toNumericString(engagement.committedAmount),
      commitmentInstrument: engagement.commitmentInstrument,
      isBinding: engagement.isBinding,
      declineReason: engagement.declineReason,
      createdAt: new Date(engagement.createdAt),
    });
  }

  // -------------------------------------------------------------------------
  // Documents and acknowledgements
  // -------------------------------------------------------------------------

  async listDocuments(
    siteId: string,
    projectId: string | null,
  ): Promise<readonly DocumentRecord[]> {
    const rows = await this.db
      .select()
      .from(documents)
      .where(
        projectId === null
          ? eq(documents.siteId, siteId)
          : or(eq(documents.siteId, siteId), eq(documents.projectId, projectId)),
      )
      .orderBy(asc(documents.createdAt), asc(documents.id));

    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      projectId: row.projectId,
      blobPath: row.blobPath,
      originalFilename: row.originalFilename,
      contentType: row.contentType,
      sizeBytes: Number(row.sizeBytes),
      /**
       * `doc_type` is nullable in the database but never null on the record: it
       * is a blob-path segment, and a null would format a path with an empty
       * one. Resolved through the same function the write path uses, so a row
       * stored before the column was relaxed reads back as `other` rather than
       * addressing a blob nothing wrote.
       */
      docType: normalizeDocType(row.docType),
      disclosureClass: row.disclosureClass,
      uploadedByUserId: row.uploadedByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async addDocument(document: DocumentRecord): Promise<void> {
    await this.db.insert(documents).values({
      id: document.id,
      siteId: document.siteId,
      projectId: document.projectId,
      blobPath: document.blobPath,
      originalFilename: document.originalFilename,
      contentType: document.contentType,
      sizeBytes: String(document.sizeBytes),
      docType: document.docType,
      disclosureClass: document.disclosureClass,
      uploadedByUserId: document.uploadedByUserId,
      createdAt: new Date(document.createdAt),
    });
  }

  async listAcknowledgements(projectId: string): Promise<readonly AcknowledgementRecord[]> {
    const rows = await this.db
      .select()
      .from(acknowledgements)
      .where(eq(acknowledgements.projectId, projectId))
      .orderBy(asc(acknowledgements.acknowledgedAt), asc(acknowledgements.id));

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      userId: row.userId,
      agreementKey: row.agreementKey,
      typedName: row.typedName,
      acknowledgedAt: row.acknowledgedAt.toISOString(),
      ipAddress: row.ipAddress,
    }));
  }

  // -------------------------------------------------------------------------
  // Investors
  // -------------------------------------------------------------------------

  async getInvestorProfileByUserId(userId: string): Promise<InvestorProfile | null> {
    const [row] = await this.db
      .select()
      .from(investors)
      .where(eq(investors.userId, userId))
      .limit(1);

    if (row === undefined) return null;

    return {
      id: row.id,
      userId: row.userId,
      organizationName: row.organizationName,
      investorType: row.investorType,
      capitalType: row.capitalType,
      fundingStageFocus: toStringArray(
        row.fundingStageFocus,
      ) as InvestorProfile["fundingStageFocus"],
      ticketSizeMin: toNumber(row.ticketSizeMin),
      ticketSizeMax: toNumber(row.ticketSizeMax),
      geographies: toStringArray(row.geographies),
      investmentObjectives: toStringArray(row.investmentObjectives),
      impactPriorities: toStringArray(row.impactPriorities),
      decisionCriteria: toStringArray(row.decisionCriteria),
      /**
       * Spread rather than `?? undefined`: under `exactOptionalPropertyTypes`
       * an optional property may be absent or a string, but not explicitly
       * `undefined`, and the two are only interchangeable when the compiler is
       * not asked to tell them apart.
       */
      ...(row.dealRoomProfile === null ? {} : { dealRoomProfile: row.dealRoomProfile }),
      visiblePortfolioScope: toStringArray(row.visiblePortfolioScope),
      onboardingCompletedAt: toIso(row.onboardingCompletedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Keyed on `user_id`, not `id`. That is the column the domain looks a profile
   * up by and the one carrying the unique constraint, so an upsert on the
   * primary key would happily write a second profile for the same person.
   *
   * `investor_type` and `capital_type` are `NOT NULL` here but optional on the
   * record; the fallbacks are the ones `toInvestorProfilePayload` already uses,
   * so a profile round-trips unchanged.
   */
  async upsertInvestorProfile(profile: InvestorProfile): Promise<void> {
    const values = {
      organizationName: profile.organizationName,
      investorType: (profile.investorType ??
        "impact_investor") as typeof investors.$inferInsert.investorType,
      capitalType: (profile.capitalType ??
        "concessionary_debt") as typeof investors.$inferInsert.capitalType,
      fundingStageFocus: [...profile.fundingStageFocus],
      ticketSizeMin: toNumericString(profile.ticketSizeMin),
      ticketSizeMax: toNumericString(profile.ticketSizeMax),
      geographies: [...profile.geographies],
      investmentObjectives: [...(profile.investmentObjectives ?? [])],
      impactPriorities: [...(profile.impactPriorities ?? [])],
      decisionCriteria: [...(profile.decisionCriteria ?? [])],
      dealRoomProfile: profile.dealRoomProfile ?? null,
      visiblePortfolioScope: [...(profile.visiblePortfolioScope ?? [])],
      onboardingCompletedAt: toDate(profile.onboardingCompletedAt),
    };

    await this.db
      .insert(investors)
      .values({
        id: profile.id,
        userId: profile.userId ?? profile.id,
        ...values,
        ...(profile.createdAt === undefined ? {} : { createdAt: new Date(profile.createdAt) }),
      })
      .onConflictDoUpdate({ target: investors.userId, set: values });
  }

  // -------------------------------------------------------------------------
  // Transactions
  // -------------------------------------------------------------------------

  /**
   * Rolls back on a failed `Result` as well as on a throw.
   *
   * That is the memory store's contract — it keeps the working copy only when
   * `isFailedResult(result)` is false — and it matters because `core` reports a
   * conflict or a validation failure by *returning* one, not by throwing. A
   * transaction that committed those would leave the writes a rejected workflow
   * had already made, which is the bug this mirrors away.
   *
   * PostgreSQL only rolls back on an exception, so a sentinel is thrown to force
   * it and swallowed here, returning the failure to the caller intact.
   */
  async transaction<T>(operation: (store: BackendStore) => Promise<T>): Promise<T> {
    const rollback = Symbol("sunsum.rollback");
    let failure: T | undefined;

    try {
      return await this.db.transaction(async (tx) => {
        const result = await operation(new PostgresBackendStore(tx));
        if (isFailedResult(result)) {
          failure = result;
          throw rollback;
        }
        return result;
      });
    } catch (error) {
      if (error === rollback) return failure as T;
      throw error;
    }
  }
}

/**
 * The store the handlers use when `SUNSUM_STORE=db`.
 *
 * Lazy on purpose. Building the store opens a pool, and this module is imported
 * by the store selector whether or not `SUNSUM_STORE=db`, so an eager instance
 * would demand a `DATABASE_URL` from anyone running on the mock — including CI,
 * which has no database.
 *
 * Reading a method therefore hands back a wrapper and builds nothing: the store
 * is constructed when a call is actually made. Constructing inside the trap
 * instead would make merely touching this object — a type check, a log line, a
 * test comparing it against the mock — fail without a connection string, which
 * is the opposite of what lazy is for.
 */
export const postgresBackendStore: BackendStore = new Proxy({} as BackendStore, {
  get(_target, property: keyof BackendStore) {
    /**
     * `nextId` is the one synchronous member, and wrapping it in an `async`
     * function like the rest would hand callers a `Promise<string>` where the
     * interface promises a `string` — every generated id would stringify to
     * "[object Promise]" and every insert would fail a uuid cast.
     */
    if (property === "nextId") {
      return (prefix: string): string => new PostgresBackendStore().nextId(prefix);
    }

    /**
     * The wrapper is `async` so that a missing `DATABASE_URL` arrives as a
     * rejected promise. Every other `BackendStore` method is typed as returning
     * one, so throwing synchronously would escape a caller's `.catch()`.
     */
    return async (...args: readonly unknown[]) => {
      const store = new PostgresBackendStore();
      return (store[property] as (...a: readonly unknown[]) => unknown)(...args);
    };
  },
});
