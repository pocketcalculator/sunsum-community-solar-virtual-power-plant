import { ROLES } from "@/backend/core/identity";
import { PROJECT_STAGES, SITE_TYPES, VIABILITY_STATUSES } from "@/backend/core/projects";
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
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
  DOCUMENT_DISCLOSURE_CLASSES,
  ENGAGEMENT_STATES,
  FUNDING_NEED_STATUSES,
  FUNDING_NEED_TYPES,
  FUNDING_STAGES,
  INVESTOR_TYPES,
  LIVE_ENGAGEMENT_STATES,
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

/**
 * Renders a jsonb array literal for use with the containment operator `<@`.
 *
 * A CHECK constraint cannot contain a subquery, so validating the elements of a
 * jsonb array means asking whether the column is contained in a fixed set. The
 * set is built from the same `as const` array as the type, for the same reason
 * `oneOf` is.
 */
function jsonbLiteral(values: readonly string[]): string {
  return `'${JSON.stringify(values)}'::jsonb`;
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
    addressRaw: text("address_raw"),
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
    siteType: text("site_type", { enum: SITE_TYPES }),
    ownershipStatus: text("ownership_status", { enum: OWNERSHIP_STATUSES }),
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
    check("sites_site_type_check", sql`${t.siteType} IS NULL OR ${oneOf(t.siteType, SITE_TYPES)}`),
    check(
      "sites_ownership_status_check",
      sql`${t.ownershipStatus} IS NULL OR ${oneOf(t.ownershipStatus, OWNERSHIP_STATUSES)}`,
    ),
    check("sites_submission_status_check", oneOf(t.submissionStatus, SUBMISSION_STATUSES)),
    /**
     * A draft is allowed to be incomplete — that is what "save and come back
     * later" means, and making these columns `NOT NULL` outright made it
     * unrepresentable. Completeness is required from the moment the site leaves
     * draft, which is when it starts being reviewed.
     */
    check(
      "sites_complete_once_submitted_check",
      sql`${t.submissionStatus} = 'draft' OR (${t.addressRaw} IS NOT NULL AND ${t.siteType} IS NOT NULL AND ${t.ownershipStatus} IS NOT NULL)`,
    ),
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
    /**
     * Ordering alone was not enough — review pointed out that `-100 <= -1`
     * passes it. A system cannot be a negative number of kilowatts, so the
     * bound belongs here too.
     */
    check(
      "assessments_size_range_check",
      sql`(${t.estimatedSystemSizeKwLow} IS NULL OR ${t.estimatedSystemSizeKwLow} >= 0) AND (${t.estimatedSystemSizeKwHigh} IS NULL OR ${t.estimatedSystemSizeKwHigh} >= 0) AND (${t.estimatedSystemSizeKwLow} IS NULL OR ${t.estimatedSystemSizeKwHigh} IS NULL OR ${t.estimatedSystemSizeKwLow} <= ${t.estimatedSystemSizeKwHigh})`,
    ),
    check(
      "assessments_generation_range_check",
      sql`(${t.estimatedAnnualGenerationKwhLow} IS NULL OR ${t.estimatedAnnualGenerationKwhLow} >= 0) AND (${t.estimatedAnnualGenerationKwhHigh} IS NULL OR ${t.estimatedAnnualGenerationKwhHigh} >= 0) AND (${t.estimatedAnnualGenerationKwhLow} IS NULL OR ${t.estimatedAnnualGenerationKwhHigh} IS NULL OR ${t.estimatedAnnualGenerationKwhLow} <= ${t.estimatedAnnualGenerationKwhHigh})`,
    ),
    /** Both list columns must actually be lists, which jsonb alone does not guarantee. */
    check("assessments_flags_is_array", sql`jsonb_typeof(${t.flags}) = 'array'`),
    check(
      "assessments_missing_information_is_array",
      sql`jsonb_typeof(${t.missingInformation}) = 'array'`,
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
    /**
     * Fail closed. The deal room filters on this to decide what an investor may
     * see, so a document whose class nobody set must be treated as the owner's
     * private material rather than published. The electricity bill is the case
     * that makes this concrete.
     */
    disclosureClass: text("disclosure_class", { enum: DOCUMENT_DISCLOSURE_CLASSES })
      .notNull()
      .default("owner_private"),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("documents_site_idx").on(t.siteId),
    index("documents_project_idx").on(t.projectId),
    check(
      "documents_disclosure_class_check",
      oneOf(t.disclosureClass, DOCUMENT_DISCLOSURE_CLASSES),
    ),
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
      sql`(${t.ticketSizeMin} IS NULL OR ${t.ticketSizeMin} >= 0) AND (${t.ticketSizeMax} IS NULL OR ${t.ticketSizeMax} >= 0) AND (${t.ticketSizeMin} IS NULL OR ${t.ticketSizeMax} IS NULL OR ${t.ticketSizeMin} <= ${t.ticketSizeMax})`,
    ),
    /**
     * Both list columns must actually be lists, which jsonb alone does not
     * guarantee, and the stage list must hold real stages. A CHECK cannot run a
     * subquery, so element validation uses jsonb containment: every element of
     * the column has to appear in the literal set built from `FUNDING_STAGES`.
     * Without it the column happily stored `["not_a_stage"]`, and a mandate
     * nothing can ever match is worse than a rejected write.
     */
    check(
      "investors_funding_stage_focus_is_array",
      sql`jsonb_typeof(${t.fundingStageFocus}) = 'array'`,
    ),
    check(
      "investors_funding_stage_focus_values_check",
      sql`${t.fundingStageFocus} <@ ${sql.raw(jsonbLiteral(FUNDING_STAGES))}`,
    ),
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
    /**
     * Nullable. A need can be raised before it is priced — the accept workflow
     * creates exactly that, a feasibility need with no amount yet — so
     * `NOT NULL` with a positive check made the demo's critical path fail. The
     * amount must still be positive once it exists.
     */
    amountRequested: numeric("amount_requested", { precision: 14, scale: 2 }),
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
    check(
      "funding_needs_amount_requested_check",
      sql`${t.amountRequested} IS NULL OR ${t.amountRequested} > 0`,
    ),
    check("funding_needs_amount_committed_check", sql`${t.amountCommitted} >= 0`),
    /**
     * Not redundant with the primary key. It is what lets `investor_engagements`
     * carry a composite foreign key and so guarantee that an engagement's need
     * belongs to the engagement's project.
     */
    unique("funding_needs_id_project_key").on(t.id, t.projectId),
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
    fundingNeedId: uuid("funding_need_id"),
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
     * Two problems at once, which is why this is an expression index rather
     * than a `UNIQUE` constraint.
     *
     * The `WHERE` makes it partial: an investor may hold one live engagement
     * per project or need, but after `declined` or `withdrawn` they are free to
     * come back, and an unconditional constraint forbade that.
     *
     * The `coalesce` stands in for `NULLS NOT DISTINCT`, which PostgreSQL
     * supports on constraints but not on partial indexes. Without it the
     * default "every NULL is distinct" rule would let one investor hold any
     * number of whole-project engagements, each a separate row with
     * `funding_need_id IS NULL`.
     */
    uniqueIndex("investor_engagements_live_unique")
      .on(
        t.investorId,
        t.projectId,
        sql`coalesce(${t.fundingNeedId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(oneOf(t.state, LIVE_ENGAGEMENT_STATES)),
    /**
     * Composite, not two independent references. Separate foreign keys let an
     * engagement point at project P2 while its funding need belongs to P1 — a
     * commitment recorded against the wrong project's books. `MATCH SIMPLE` is
     * the default and is what makes this work: the check is skipped entirely
     * when `funding_need_id` is NULL, so whole-project engagements stay legal.
     */
    foreignKey({
      columns: [t.projectId, t.fundingNeedId],
      foreignColumns: [fundingNeeds.projectId, fundingNeeds.id],
      name: "investor_engagements_funding_need_fk",
    }).onDelete("cascade"),
    /** Lets `diligence_requests` carry the same kind of composite reference. */
    unique("investor_engagements_id_project_key").on(t.id, t.projectId),
    check("investor_engagements_state_check", oneOf(t.state, ENGAGEMENT_STATES)),
    check(
      "investor_engagements_committed_amount_check",
      sql`${t.committedAmount} IS NULL OR ${t.committedAmount} >= 0`,
    ),
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
    engagementId: uuid("engagement_id").notNull(),
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
    /**
     * Same reasoning as on the engagement itself: independent references would
     * let a diligence item sit on project P2 while its engagement belongs to
     * P1, which is how a question about one deal shows up in another deal room.
     */
    foreignKey({
      columns: [t.engagementId, t.projectId],
      foreignColumns: [investorEngagements.id, investorEngagements.projectId],
      name: "diligence_requests_engagement_fk",
    }).onDelete("cascade"),
    check(
      "diligence_requests_assigned_to_role_check",
      oneOf(t.assignedToRole, DILIGENCE_ASSIGNEE_ROLES),
    ),
    check("diligence_requests_item_type_check", oneOf(t.itemType, DILIGENCE_ITEM_TYPES)),
    check("diligence_requests_status_check", oneOf(t.status, DILIGENCE_STATUSES)),
  ],
);
