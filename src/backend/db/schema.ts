import { ROLES } from "@/backend/core/identity";
import { PROJECT_STAGES, SITE_TYPES, VIABILITY_STATUSES } from "@/backend/core/projects";
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  CAPITAL_TYPES,
  DILIGENCE_ASSIGNEE_ROLES,
  DILIGENCE_ITEM_TYPES,
  DILIGENCE_STATUSES,
  ENGAGEMENT_STATES,
  FUNDING_NEED_STATUSES,
  FUNDING_NEED_TYPES,
  FUNDING_STAGES,
  INVESTOR_TYPES,
  OWNERSHIP_STATUSES,
  SUBMISSION_STATUSES,
} from "./enums";

/**
 * The eleven tables of design document section 5.2.
 *
 * Read ADR 0001 before changing anything here. The choices that look arbitrary
 * are not: text-plus-CHECK instead of native enums, `numeric` instead of
 * `double precision`, `timestamptz` instead of `timestamp`, and
 * `NULLS NOT DISTINCT` on one unique constraint each have a reason recorded
 * there.
 */

/**
 * Renders `column IN ('a', 'b')` for a CHECK constraint.
 *
 * The values come from our own `as const` arrays, never from user input, so
 * interpolating them as literals is safe. Building the constraint from the same
 * array the TypeScript union comes from is the point: the database and the type
 * system cannot disagree about what a column may hold, because there is only
 * one list.
 */
function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  const literals = values.map((value) => `'${value}'`).join(", ");
  return sql`${column} IN ${sql.raw(`(${literals})`)}`;
}

/** Every table's identifier and creation stamp are spelled the same way. */
const primaryKey = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// S-IAM
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    /**
     * Null for identities that authenticate through a provider rather than a
     * local credential. Section 3 names Entra ID while section 5.2 carries this
     * column; the schema allows either, and ADR 0001 open question 4 asks the
     * charter to settle which the demo actually uses.
     */
    passwordHash: text("password_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    check("users_role_check", oneOf(t.role, ROLES)),
  ],
);

// ---------------------------------------------------------------------------
// S-SITE
// ---------------------------------------------------------------------------

export const sites = pgTable(
  "sites",
  {
    id: primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    addressRaw: text("address_raw").notNull(),
    /**
     * `numeric`, not `double precision`. Coordinates are compared and
     * deduplicated, and binary floating point makes two identical addresses
     * differ in the last bits. Six decimal places is about 0.1 m.
     */
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    geocodeConfidence: numeric("geocode_confidence", { precision: 4, scale: 3 }),
    /**
     * A deliberate addition to section 5.2, which lists neither column.
     *
     * `GET /portfolio` already filters on region, and `ProjectRecord` already
     * carries both fields, so without them the schema cannot serve an endpoint
     * the same design document specifies. They are geocoder output, which is
     * why they sit beside the coordinates rather than in `projects`. Raised as
     * ADR 0001 open question 5.
     */
    locality: text("locality"),
    region: text("region"),
    siteType: text("site_type", { enum: SITE_TYPES }).notNull(),
    ownershipStatus: text("ownership_status", { enum: OWNERSHIP_STATUSES }).notNull(),
    approximateAreaSqm: numeric("approximate_area_sqm", { precision: 12, scale: 2 }),
    electricityUsageKwhAnnual: numeric("electricity_usage_kwh_annual", {
      precision: 14,
      scale: 2,
    }),
    /** Deliberately nullable: a site exists before its bill is uploaded. */
    electricityBillDocId: uuid("electricity_bill_doc_id").references(
      (): AnyPgColumn => documents.id,
      { onDelete: "set null" },
    ),
    hasExistingSolar: boolean("has_existing_solar"),
    consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),
    submissionStatus: text("submission_status", { enum: SUBMISSION_STATUSES })
      .notNull()
      .default("draft"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sites_owner_idx").on(t.ownerUserId),
    index("sites_submission_status_idx").on(t.submissionStatus),
    /** Serves the portfolio's region filter. */
    index("sites_region_idx").on(t.region),
    check("sites_site_type_check", oneOf(t.siteType, SITE_TYPES)),
    check("sites_ownership_status_check", oneOf(t.ownershipStatus, OWNERSHIP_STATUSES)),
    check("sites_submission_status_check", oneOf(t.submissionStatus, SUBMISSION_STATUSES)),
    check(
      "sites_latitude_range_check",
      sql`${t.latitude} IS NULL OR (${t.latitude} BETWEEN -90 AND 90)`,
    ),
    check(
      "sites_longitude_range_check",
      sql`${t.longitude} IS NULL OR (${t.longitude} BETWEEN -180 AND 180)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// S-ASSESS
// ---------------------------------------------------------------------------

/**
 * Append-only. Section 5.2 says a re-run writes a new row, and section 7.4 says
 * an operator override is itself an assessment rather than an edit of one, so
 * there is no update path and no `updated_at`. The current assessment for a
 * site is the newest row, which is what `assessments_site_created_idx` serves.
 */
export const assessments = pgTable(
  "assessments",
  {
    id: primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    rulesetVersion: text("ruleset_version").notNull(),
    /** The inputs as they stood at the time, so an old verdict stays explicable. */
    inputsUsed: jsonb("inputs_used").notNull(),
    estimatedSystemSizeKwLow: numeric("estimated_system_size_kw_low", {
      precision: 12,
      scale: 2,
    }),
    estimatedSystemSizeKwHigh: numeric("estimated_system_size_kw_high", {
      precision: 12,
      scale: 2,
    }),
    estimatedAnnualGenerationKwhLow: numeric("estimated_annual_generation_kwh_low", {
      precision: 14,
      scale: 2,
    }),
    estimatedAnnualGenerationKwhHigh: numeric("estimated_annual_generation_kwh_high", {
      precision: 14,
      scale: 2,
    }),
    /**
     * Section 5.3 does not enumerate this, so it carries no CHECK. ADR 0001
     * open question 3 asks for the list; until then an unconstrained column is
     * honest, where a guessed constraint would reject valid data.
     */
    preliminaryProjectType: text("preliminary_project_type"),
    viabilityStatus: text("viability_status", { enum: VIABILITY_STATUSES }).notNull(),
    flags: jsonb("flags").notNull().default(sql`'[]'::jsonb`),
    missingInformation: jsonb("missing_information").notNull().default(sql`'[]'::jsonb`),
    isOverride: boolean("is_override").notNull().default(false),
    overrideReason: text("override_reason"),
    overriddenByUserId: uuid("overridden_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("assessments_site_created_idx").on(t.siteId, t.createdAt.desc()),
    check("assessments_viability_status_check", oneOf(t.viabilityStatus, VIABILITY_STATUSES)),
    /** Section 7.4 requires a reason and an author for an override. */
    check(
      "assessments_override_reason_check",
      sql`${t.isOverride} = false OR (${t.overrideReason} IS NOT NULL AND ${t.overriddenByUserId} IS NOT NULL)`,
    ),
    check(
      "assessments_size_range_check",
      sql`${t.estimatedSystemSizeKwLow} IS NULL OR ${t.estimatedSystemSizeKwHigh} IS NULL OR ${t.estimatedSystemSizeKwLow} <= ${t.estimatedSystemSizeKwHigh}`,
    ),
    check(
      "assessments_generation_range_check",
      sql`${t.estimatedAnnualGenerationKwhLow} IS NULL OR ${t.estimatedAnnualGenerationKwhHigh} IS NULL OR ${t.estimatedAnnualGenerationKwhLow} <= ${t.estimatedAnnualGenerationKwhHigh}`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// S-PROJ
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: primaryKey(),
    /** One project per site, per section 5.2. */
    siteId: uuid("site_id")
      .notNull()
      .unique()
      .references(() => sites.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    assignedOperatorUserId: uuid("assigned_operator_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    stage: text("stage", { enum: PROJECT_STAGES }).notNull().default("pre_development"),
    estimatedCapacityKw: numeric("estimated_capacity_kw", { precision: 12, scale: 2 }),
    nextAction: text("next_action"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    /**
     * Default false in the database, not only in application code. This is the
     * flag that separates a private pipeline entry from something an investor
     * can see; a row inserted by a path that forgets it must be invisible, not
     * visible. Section 8.3.
     */
    visibleToInvestors: boolean("visible_to_investors").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("projects_stage_idx").on(t.stage),
    /** Serves the investor portfolio read, which always filters on visibility. */
    index("projects_visible_stage_idx").on(t.visibleToInvestors, t.stage),
    check("projects_stage_check", oneOf(t.stage, PROJECT_STAGES)),
  ],
);

// ---------------------------------------------------------------------------
// S-DOC
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: primaryKey(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    /** A path into blob storage. The bytes are never in the database. */
    blobPath: text("blob_path").notNull(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: numeric("size_bytes", { precision: 20, scale: 0 }).notNull(),
    docType: text("doc_type").notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("documents_site_idx").on(t.siteId),
    index("documents_project_idx").on(t.projectId),
    /**
     * Section 5.2 writes the parent as "site_id / project_id", which reads as
     * one or the other. Without this, a document can belong to both or to
     * neither, and an orphan is invisible to every access rule that starts from
     * a parent — it would be readable by anyone who guessed its id.
     */
    check(
      "documents_single_parent_check",
      sql`(${t.siteId} IS NOT NULL)::int + (${t.projectId} IS NOT NULL)::int = 1`,
    ),
    check("documents_size_check", sql`${t.sizeBytes} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// S-ACT
// ---------------------------------------------------------------------------

/**
 * Append-only, like assessments: an audit trail that can be edited is not one.
 */
export const activity = pgTable(
  "activity",
  {
    id: primaryKey(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    note: text("note"),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_site_created_idx").on(t.siteId, t.createdAt.desc()),
    index("activity_project_created_idx").on(t.projectId, t.createdAt.desc()),
    check(
      "activity_single_parent_check",
      sql`(${t.siteId} IS NOT NULL)::int + (${t.projectId} IS NOT NULL)::int = 1`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// S-ACK
// ---------------------------------------------------------------------------

export const acknowledgements = pgTable(
  "acknowledgements",
  {
    id: primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    agreementKey: text("agreement_key").notNull(),
    typedName: text("typed_name").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
    /** `inet` would be tidier, but `text` keeps the column portable. */
    ipAddress: text("ip_address"),
  },
  (t) => [
    /** One acknowledgement per person per agreement per project. */
    unique("acknowledgements_unique").on(t.projectId, t.userId, t.agreementKey),
  ],
);

// ---------------------------------------------------------------------------
// S-INV
// ---------------------------------------------------------------------------

export const investors = pgTable(
  "investors",
  {
    id: primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationName: text("organization_name").notNull(),
    investorType: text("investor_type", { enum: INVESTOR_TYPES }).notNull(),
    capitalType: text("capital_type", { enum: CAPITAL_TYPES }).notNull(),
    /** Funding stages, not project stages. See `FUNDING_STAGES`. */
    fundingStageFocus: jsonb("funding_stage_focus")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ticketSizeMin: numeric("ticket_size_min", { precision: 14, scale: 2 }),
    ticketSizeMax: numeric("ticket_size_max", { precision: 14, scale: 2 }),
    geographies: jsonb("geographies")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    investmentObjectives: jsonb("investment_objectives").notNull().default(sql`'{}'::jsonb`),
    impactPriorities: jsonb("impact_priorities").notNull().default(sql`'{}'::jsonb`),
    decisionCriteria: jsonb("decision_criteria").notNull().default(sql`'{}'::jsonb`),
    /** Section 7.7 derives the default from `investor_type`; section 5.3 never enumerates it. */
    dealRoomProfile: text("deal_room_profile"),
    visiblePortfolioScope: jsonb("visible_portfolio_scope").notNull().default(sql`'{}'::jsonb`),
    /**
     * Null until onboarding finishes. Section 7.7 gates the portfolio on this,
     * so it is the column the `GET /portfolio` guard reads.
     */
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("investors_investor_type_check", oneOf(t.investorType, INVESTOR_TYPES)),
    check("investors_capital_type_check", oneOf(t.capitalType, CAPITAL_TYPES)),
    check(
      "investors_ticket_size_check",
      sql`${t.ticketSizeMin} IS NULL OR ${t.ticketSizeMax} IS NULL OR ${t.ticketSizeMin} <= ${t.ticketSizeMax}`,
    ),
    /** Both list columns must actually be lists, which jsonb alone does not guarantee. */
    check("investors_funding_stage_focus_is_array", sql`jsonb_typeof(${t.fundingStageFocus}) = 'array'`),
    check("investors_geographies_is_array", sql`jsonb_typeof(${t.geographies}) = 'array'`),
  ],
);

// ---------------------------------------------------------------------------
// S-ENG
// ---------------------------------------------------------------------------

export const fundingNeeds = pgTable(
  "funding_needs",
  {
    id: primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    needType: text("need_type", { enum: FUNDING_NEED_TYPES }).notNull(),
    /**
     * A funding stage, not a project stage. Review found that the portfolio's
     * mandate match ignores this column entirely; it is the column that should
     * drive the comparison against `investors.funding_stage_focus`.
     */
    stage: text("stage", { enum: FUNDING_STAGES }).notNull(),
    description: text("description").notNull(),
    amountRequested: numeric("amount_requested", { precision: 14, scale: 2 }).notNull(),
    amountCommitted: numeric("amount_committed", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    status: text("status", { enum: FUNDING_NEED_STATUSES }).notNull().default("open"),
    deliverableDocId: uuid("deliverable_doc_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("funding_needs_project_idx").on(t.projectId),
    index("funding_needs_status_stage_idx").on(t.status, t.stage),
    check("funding_needs_need_type_check", oneOf(t.needType, FUNDING_NEED_TYPES)),
    check("funding_needs_stage_check", oneOf(t.stage, FUNDING_STAGES)),
    check("funding_needs_status_check", oneOf(t.status, FUNDING_NEED_STATUSES)),
    check("funding_needs_amount_requested_check", sql`${t.amountRequested} > 0`),
    check("funding_needs_amount_committed_check", sql`${t.amountCommitted} >= 0`),
  ],
);

export const investorEngagements = pgTable(
  "investor_engagements",
  {
    id: primaryKey(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Null when the investor is evaluating the whole project rather than one need. */
    fundingNeedId: uuid("funding_need_id").references(() => fundingNeeds.id, {
      onDelete: "cascade",
    }),
    state: text("state", { enum: ENGAGEMENT_STATES }).notNull().default("interested"),
    stateChangedAt: timestamp("state_changed_at", { withTimezone: true }).notNull().defaultNow(),
    committedAmount: numeric("committed_amount", { precision: 14, scale: 2 }),
    commitmentInstrument: text("commitment_instrument"),
    /** Section 8.4: a commitment is non-binding unless it says otherwise. */
    isBinding: boolean("is_binding").notNull().default(false),
    commitmentTerms: jsonb("commitment_terms"),
    declineReason: text("decline_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("investor_engagements_investor_idx").on(t.investorId),
    index("investor_engagements_project_idx").on(t.projectId),
    /**
     * `NULLS NOT DISTINCT` is the whole point. PostgreSQL treats NULLs in a
     * unique index as distinct by default, so a plain constraint would allow an
     * investor unlimited whole-project engagements on one project — every one
     * of them a row with `funding_need_id IS NULL`, each considered unique.
     * Requires PostgreSQL 15 or later.
     */
    unique("investor_engagements_unique")
      .on(t.investorId, t.projectId, t.fundingNeedId)
      .nullsNotDistinct(),
    check("investor_engagements_state_check", oneOf(t.state, ENGAGEMENT_STATES)),
    check(
      "investor_engagements_decline_reason_check",
      sql`${t.state} <> 'declined' OR ${t.declineReason} IS NOT NULL`,
    ),
  ],
);

export const diligenceRequests = pgTable(
  "diligence_requests",
  {
    id: primaryKey(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => investorEngagements.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    raisedByUserId: uuid("raised_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assignedToRole: text("assigned_to_role", { enum: DILIGENCE_ASSIGNEE_ROLES }).notNull(),
    itemType: text("item_type", { enum: DILIGENCE_ITEM_TYPES }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: DILIGENCE_STATUSES }).notNull().default("open"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    resolvedDocumentId: uuid("resolved_document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("diligence_requests_engagement_idx").on(t.engagementId),
    index("diligence_requests_status_idx").on(t.status),
    check(
      "diligence_requests_assigned_to_role_check",
      oneOf(t.assignedToRole, DILIGENCE_ASSIGNEE_ROLES),
    ),
    check("diligence_requests_item_type_check", oneOf(t.itemType, DILIGENCE_ITEM_TYPES)),
    check("diligence_requests_status_check", oneOf(t.status, DILIGENCE_STATUSES)),
  ],
);
