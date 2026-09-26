import { LIVE_READ_LIMITS } from "./constants";
import { malformed, rejectRead } from "./errors";
import type {
  LiveIdentity, OutstandingItem, ReadAcknowledgement, ReadActivity,
  ReadAssessmentHistory, ReadEngagement, ReadExportDocument, ReadExportProject,
  ReadFundingNeed, ReadInvestorAssessment, ReadInvestorDocument,
  ReadInvestorProfile, ReadInvestorProject, ReadInvestorSite, ReadPerson,
  ReadPipeline, ReadPrivateAssessment, ReadPrivateDocument, ReadPrivateProject,
  ReadPrivateSite, ReadRecord, ReadSummary, ReadTimelineEvent,
} from "./types";
import {
  activeEngagementStates, boolean, capacityRange, choice, count, date,
  energyRange, engagementStates, fundingStages, id, journeyStages, list,
  number, object, optionalId, optionalObject, projectStages, role,
  safeFileName, siteTypes, strings, submissionStatuses, text, timestamp,
  uniqueById, viabilityStatuses, type JsonRecord,
} from "./values";

export type IdentityFields = Omit<LiveIdentity, "scope" | "provenance">;

function requireSame(actual: string | null, expected: string | null): void {
  if (actual !== expected) {
    rejectRead("denied", "The response is outside the observed participant or record scope.", "scope_mismatch");
  }
}

export function identityFields(value: unknown): IdentityFields {
  const source = object(value);
  const observedRole = role(source.role);
  const investor = observedRole === "investor" ? optionalObject(source.investor) : null;
  const onboarded = observedRole === "investor" ? boolean(source.onboarded) : null;
  const investorId = investor === null ? null : id(investor.id);
  if (onboarded === true && investorId === null) malformed();
  if (investor?.onboarding_completed_at !== undefined) {
    const completed = timestamp(investor.onboarding_completed_at);
    if (onboarded !== (completed !== null)) malformed();
  }
  return {
    userId: id(source.user_id),
    role: observedRole,
    onboarded,
    investorId,
    organizationName: investor === null ? null : text(investor.organization_name),
  };
}

export function privateSite(value: unknown): ReadPrivateSite {
  const source = object(value);
  return {
    id: id(source.id),
    ownerUserId: optionalId(source.owner_user_id),
    address: text(source.address_raw),
    latitude: number(source.latitude, -90, 90),
    longitude: number(source.longitude, -180, 180),
    geocodeConfidence: number(source.geocode_confidence, 0, 1),
    siteType: choice(source.site_type, siteTypes),
    ownershipStatus: text(source.ownership_status),
    approximateAreaSqm: number(source.approximate_area_sqm),
    electricityUsageKwhAnnual: number(source.electricity_usage_kwh_annual),
    hasExistingSolar: boolean(source.has_existing_solar),
    consentGivenAt: timestamp(source.consent_given_at),
    submissionStatus: choice(source.submission_status, submissionStatuses),
    createdAt: timestamp(source.created_at),
    updatedAt: timestamp(source.updated_at),
  };
}

export function privateProject(value: unknown, siteId: string): ReadPrivateProject | null {
  const source = optionalObject(value);
  if (source === null) return null;
  requireSame(id(source.site_id), siteId);
  return {
    id: id(source.id),
    siteId,
    name: text(source.name),
    assignedOperatorUserId: optionalId(source.assigned_operator_user_id),
    stage: choice(source.stage, projectStages),
    estimatedCapacityKw: number(source.estimated_capacity_kw),
    nextAction: text(source.next_action),
    // WS2 accepts date-only input; its database mapper returns an ISO timestamp.
    targetDate: typeof source.target_date === "string" && source.target_date.includes("T")
      ? timestamp(source.target_date) : date(source.target_date),
    visibleToInvestors: boolean(source.visible_to_investors),
    createdAt: timestamp(source.created_at),
    updatedAt: timestamp(source.updated_at),
  };
}

export function investorAssessment(value: unknown): ReadInvestorAssessment {
  const source = object(value);
  return {
    id: id(source.id),
    rulesetVersion: text(source.ruleset_version),
    estimatedSystemSizeKw: capacityRange(source),
    estimatedAnnualGenerationKwh: energyRange(source),
    preliminaryProjectType: text(source.preliminary_project_type),
    viabilityStatus: choice(source.viability_status, viabilityStatuses),
    flags: strings(source.flags),
    missingInformation: strings(source.missing_information),
    isOverride: boolean(source.is_override),
    createdAt: timestamp(source.created_at),
  };
}

export function privateAssessment(value: unknown, siteId: string): ReadPrivateAssessment {
  const source = object(value);
  requireSame(id(source.site_id), siteId);
  const inputs = optionalObject(source.inputs_used);
  return {
    ...investorAssessment(source),
    siteId,
    inputsUsed: inputs === null ? null : {
      siteType: choice(inputs.site_type, siteTypes),
      ownershipStatus: text(inputs.ownership_status),
      approximateAreaSqm: number(inputs.approximate_area_sqm),
      electricityUsageKwhAnnual: number(inputs.electricity_usage_kwh_annual),
      hasExistingSolar: boolean(inputs.has_existing_solar),
    },
    overrideReason: text(source.override_reason),
    overriddenByUserId: optionalId(source.overridden_by_user_id),
  };
}

export function assessmentHistory<T extends ReadInvestorAssessment>(
  source: JsonRecord,
  project: (value: unknown) => T,
): ReadAssessmentHistory<T> {
  const current = source.assessment == null ? null : project(source.assessment);
  if (source.assessment_history === undefined) {
    return {
      current,
      original: null,
      human: current?.isOverride === true ? current : null,
      entries: current === null ? [] : [current],
      completeness: current === null ? "unavailable" : "current-only",
    };
  }
  const entries = uniqueById(list(source.assessment_history).map(project));
  if (current !== null && !entries.some((entry) => entry.id === current.id)) malformed();
  return {
    current,
    original: entries.find((entry) => entry.isOverride === false) ?? null,
    human: entries.filter((entry) => entry.isOverride === true).at(-1) ?? null,
    entries,
    completeness: "complete",
  };
}

export function person(value: unknown): ReadPerson | null {
  const source = optionalObject(value);
  if (source === null) return null;
  return {
    id: id(source.id),
    name: text(source.name),
    email: text(source.email),
    role: source.role == null ? null : role(source.role),
    createdAt: timestamp(source.created_at),
  };
}

function record(
  source: JsonRecord,
  core: Pick<ReadRecord, "id" | "siteId" | "projectId" | "detail">,
): ReadRecord {
  return {
    ...core,
    name: text(source.name),
    locality: text(source.locality),
    siteType: choice(source.site_type, siteTypes),
    submissionStatus: choice(source.submission_status, submissionStatuses),
    projectStage: choice(source.project_stage, projectStages),
    journeyStageId: choice(source.journey_stage_id, journeyStages),
    viabilityStatus: choice(source.viability_status, viabilityStatuses),
    estimatedCapacityKw: number(source.estimated_capacity_kw),
    estimatedSystemSizeKw: capacityRange(source),
    estimatedAnnualGenerationKwh: energyRange(source),
    preliminaryProjectType: text(source.preliminary_project_type),
    engagementState: choice(source.my_engagement_state, engagementStates),
    openFundingNeedsCount: count(source.open_funding_needs_count),
    updatedAt: timestamp(source.updated_at),
  };
}

export function siteRecord(value: unknown, owner?: IdentityFields): ReadRecord {
  const entry = object(value);
  const site = privateSite(entry.site);
  if (owner !== undefined) requireSame(site.ownerUserId, owner.userId);
  const project = owner === undefined ? null : privateProject(entry.project, site.id);
  const assessment = entry.assessment == null ? null : privateAssessment(entry.assessment, site.id);
  if (entry.submission_status != null && choice(entry.submission_status, submissionStatuses) !== site.submissionStatus) malformed();
  if (entry.project_stage != null && choice(entry.project_stage, projectStages) !== project?.stage) malformed();
  return {
    ...record({
      name: project?.name ?? null,
      site_type: site.siteType,
      submission_status: site.submissionStatus,
      project_stage: project?.stage ?? null,
      journey_stage_id: entry.journey_stage_id,
      updated_at: project?.updatedAt ?? site.updatedAt,
    }, {
      id: project?.id ?? site.id,
      siteId: site.id,
      projectId: project?.id ?? null,
      detail: owner === undefined ? { kind: "submission", siteId: site.id } : { kind: "owner-site", siteId: site.id },
    }),
    estimatedCapacityKw: project?.estimatedCapacityKw ?? null,
    estimatedSystemSizeKw: assessment?.estimatedSystemSizeKw ?? capacityRange({}),
    estimatedAnnualGenerationKwh: assessment?.estimatedAnnualGenerationKwh ?? energyRange({}),
    viabilityStatus: assessment?.viabilityStatus ?? null,
    preliminaryProjectType: assessment?.preliminaryProjectType ?? null,
  };
}

export function ownerEntries(value: unknown, identity: IdentityFields): readonly JsonRecord[] {
  const entries = list(value).map(object);
  const records = entries.map((entry) => siteRecord(entry, identity));
  uniqueById(records);
  if (new Set(records.map((item) => item.siteId)).size !== records.length) malformed();
  return entries;
}

export function submissions(value: unknown): readonly ReadRecord[] {
  return uniqueById(list(value).map((entry) => siteRecord(entry)));
}

export function pipeline(value: unknown): ReadPipeline {
  const columns = list(object(value).columns).map((raw) => {
    const column = object(raw);
    const journeyStageId = choice(column.journey_stage_id, journeyStages);
    if (journeyStageId === null) return malformed();
    const records = list(column.items).map((rawCard) => {
      const card = object(rawCard);
      const siteId = id(card.site_id);
      const projectId = optionalId(card.project_id);
      const cardId = id(card.id);
      requireSame(cardId, projectId ?? siteId);
      const cardJourney = choice(card.journey_stage_id, journeyStages);
      if (cardJourney !== journeyStageId) malformed();
      return record({
        name: card.display_name,
        site_type: card.site_type,
        submission_status: card.submission_status,
        project_stage: card.project_stage,
        journey_stage_id: card.journey_stage_id,
        viability_status: card.viability_status,
        estimated_capacity_kw: card.estimated_capacity_kw,
        updated_at: card.updated_at,
      }, {
        id: cardId,
        siteId,
        projectId,
        detail: projectId === null ? { kind: "submission", siteId } : { kind: "project", siteId, projectId },
      });
    });
    const reportedCount = count(column.count);
    if (reportedCount !== null && reportedCount !== records.length) malformed();
    return { journeyStageId, reportedCount, records };
  });
  if (new Set(columns.map((entry) => entry.journeyStageId)).size !== columns.length) malformed();
  const records = uniqueById(columns.flatMap((column) => column.records));
  if (records.length > LIVE_READ_LIMITS.maxItems) rejectRead("too-large", "The pipeline exceeds the admitted item limit.", "item_limit");
  if (new Set(records.map((entry) => entry.siteId)).size !== records.length) malformed();
  return { columns };
}

export function mergeRecords(primary: readonly ReadRecord[], board: ReadPipeline): readonly ReadRecord[] {
  const records = new Map(primary.map((entry) => [entry.siteId, entry]));
  for (const entry of board.columns.flatMap((column) => column.records)) {
    const submission = records.get(entry.siteId);
    records.set(entry.siteId, submission === undefined ? entry : {
      ...entry,
      estimatedSystemSizeKw: submission.estimatedSystemSizeKw,
      estimatedAnnualGenerationKwh: submission.estimatedAnnualGenerationKwh,
      preliminaryProjectType: submission.preliminaryProjectType,
    });
  }
  if (records.size > LIVE_READ_LIMITS.maxItems) rejectRead("too-large", "The snapshot exceeds the admitted item limit.", "item_limit");
  return uniqueById([...records.values()]);
}

export function portfolio(value: unknown): { readonly records: readonly ReadRecord[]; readonly summary: ReadSummary } {
  const source = object(value);
  const records = uniqueById(list(source.items).map((raw) => {
    const item = object(raw);
    const projectId = id(item.project_id);
    // Tier zero is an explicit allowlist, even when a response overreturns.
    return record({
      name: item.name,
      locality: item.locality,
      site_type: item.site_type,
      project_stage: item.stage,
      journey_stage_id: item.journey_stage_id,
      viability_status: item.viability_status,
      estimated_system_size_kw_low: item.estimated_system_size_kw_low,
      estimated_system_size_kw_high: item.estimated_system_size_kw_high,
      estimated_annual_generation_kwh_low: item.estimated_annual_generation_kwh_low,
      estimated_annual_generation_kwh_high: item.estimated_annual_generation_kwh_high,
      preliminary_project_type: item.preliminary_project_type,
      my_engagement_state: item.my_engagement_state,
      open_funding_needs_count: item.open_funding_needs_count,
    }, { id: projectId, projectId, siteId: null, detail: { kind: "deal-room", projectId } });
  }));
  return {
    records,
    summary: {
      recordCount: records.length,
      projectCount: count(source.project_count),
      totalEstimatedCapacityKw: number(source.total_estimated_capacity_kw),
      mandateMatch: boolean(source.mandate_match),
    },
  };
}

export function outstanding(value: unknown, allowedSites: ReadonlySet<string>): readonly OutstandingItem[] {
  return uniqueById(list(value).map((raw) => {
    const source = object(raw);
    const siteId = id(source.site_id);
    if (!allowedSites.has(siteId)) rejectRead("denied", "An outstanding item is outside the caller's sites.", "scope_mismatch");
    return {
      id: id(source.id),
      source: text(source.source),
      siteId,
      projectId: optionalId(source.project_id),
      message: text(source.message),
      createdAt: timestamp(source.created_at),
    };
  }));
}

export function investorProfile(value: unknown, identity: IdentityFields): ReadInvestorProfile {
  const source = object(value);
  const userId = id(source.user_id);
  const investorId = id(source.id);
  requireSame(userId, identity.userId);
  requireSame(investorId, identity.investorId);
  const minimum = number(source.ticket_size_min);
  const maximum = number(source.ticket_size_max);
  if (minimum !== null && maximum !== null && minimum > maximum) malformed();
  const focus = source.funding_stage_focus == null ? null :
    list(source.funding_stage_focus).map((entry) => choice(entry, fundingStages) ?? malformed());
  return {
    id: investorId,
    userId,
    organizationName: text(source.organization_name),
    investorType: text(source.investor_type),
    capitalType: text(source.capital_type),
    fundingStageFocus: focus,
    ticketSizeMin: minimum,
    ticketSizeMax: maximum,
    geographies: strings(source.geographies),
    investmentObjectives: strings(source.investment_objectives),
    impactPriorities: strings(source.impact_priorities),
    decisionCriteria: strings(source.decision_criteria),
    dealRoomProfile: text(source.deal_room_profile),
    visiblePortfolioScope: strings(source.visible_portfolio_scope),
    onboardingCompletedAt: timestamp(source.onboarding_completed_at),
    createdAt: timestamp(source.created_at),
    updatedAt: timestamp(source.updated_at),
  };
}

export function engagements(
  value: unknown,
  identity: IdentityFields,
  projectId?: string,
): readonly ReadEngagement[] {
  return uniqueById(list(value).map((raw) => {
    const source = object(raw);
    const investorId = id(source.investor_id);
    const linkedProject = id(source.project_id);
    if (identity.role === "investor") requireSame(investorId, identity.investorId);
    if (projectId !== undefined) requireSame(linkedProject, projectId);
    return {
      id: id(source.id),
      investorId,
      projectId: linkedProject,
      fundingNeedId: optionalId(source.funding_need_id),
      state: choice(source.state, engagementStates),
      stateChangedAt: timestamp(source.state_changed_at),
      isBinding: boolean(source.is_binding),
      createdAt: timestamp(source.created_at),
      projectName: text(source.project_name),
      projectStage: choice(source.project_stage, projectStages),
      journeyStageId: choice(source.journey_stage_id, journeyStages),
    };
  }));
}

export function eligibleProjects(entries: readonly ReadEngagement[]): ReadonlySet<string> {
  const latest = new Map<string, ReadEngagement>();
  for (const entry of entries) {
    // WS2 selects the last emitted row per project (created_at, id order).
    // A later state update does not make an older engagement the current row.
    latest.set(entry.projectId, entry);
  }
  return new Set([...latest.values()]
    .filter((entry) => entry.state !== null && activeEngagementStates.includes(entry.state))
    .map((entry) => entry.projectId));
}

export function fundingNeeds(value: unknown, projectId: string): readonly ReadFundingNeed[] {
  return uniqueById(list(value).map((raw) => {
    const source = object(raw);
    requireSame(id(source.project_id), projectId);
    return {
      id: id(source.id),
      projectId,
      needType: text(source.need_type),
      stage: choice(source.stage, fundingStages),
      description: text(source.description),
      amountRequested: number(source.amount_requested),
      amountCommitted: number(source.amount_committed),
      currency: null,
      status: choice(source.status, ["open", "partially_funded", "funded", "delivered", "cancelled"]),
      createdAt: timestamp(source.created_at),
    };
  }));
}

export const documentContentTypes = ["application/pdf", "image/jpeg", "image/png"] as const;

function documentMetadata(source: JsonRecord) {
  const fileName = text(source.original_filename);
  return {
    id: id(source.id),
    fileName: fileName === null ? null : safeFileName(fileName),
    contentType: text(source.content_type),
    sizeBytes: count(source.size_bytes),
    docType: text(source.doc_type),
    createdAt: timestamp(source.created_at),
  };
}

export function privateDocuments(
  value: unknown,
  siteId: string,
  projectId: string | null,
  admitBytes: boolean,
): readonly ReadPrivateDocument[] {
  return uniqueById(list(value).map((raw) => {
    const source = object(raw);
    const metadata = documentMetadata(source);
    const linkedSite = optionalId(source.site_id);
    const linkedProject = optionalId(source.project_id);
    if (linkedSite !== null) requireSame(linkedSite, siteId);
    if (linkedProject !== null && projectId !== null) requireSame(linkedProject, projectId);
    const canDownload = admitBytes && linkedSite !== null &&
      documentContentTypes.some((type) => type === metadata.contentType) &&
      (metadata.sizeBytes === null || metadata.sizeBytes <= LIVE_READ_LIMITS.downloadBytes);
    return {
      ...metadata,
      disclosure: "owner-operator",
      siteId: linkedSite,
      projectId: linkedProject,
      disclosureClass: text(source.disclosure_class),
      uploadedByUserId: optionalId(source.uploaded_by_user_id),
      download: !canDownload || linkedSite === null ? null : {
        siteId: linkedSite,
        documentId: metadata.id,
        fileName: metadata.fileName,
        contentType: metadata.contentType,
        sizeBytes: metadata.sizeBytes,
      },
    };
  }));
}

export function investorDocuments(value: unknown): readonly ReadInvestorDocument[] {
  const sources = list(value).map(object).filter((source) =>
    source.disclosure_class === undefined || source.disclosure_class === "investor_tier_1");
  return uniqueById(sources.map((source) => ({
    ...documentMetadata(source),
    disclosure: "investor-tier-1",
    download: null,
  })));
}

export function activity(value: unknown, siteId: string): readonly ReadActivity[] {
  return uniqueById(list(value).map((raw) => {
    const source = object(raw);
    const linkedSite = optionalId(source.site_id);
    if (linkedSite !== null) requireSame(linkedSite, siteId);
    return {
      id: id(source.id),
      siteId: linkedSite,
      projectId: optionalId(source.project_id),
      actorUserId: optionalId(source.actor_user_id),
      action: text(source.action),
      note: text(source.note),
      fromValue: text(source.from_value),
      toValue: text(source.to_value),
      createdAt: timestamp(source.created_at),
    };
  }));
}

export function investorTimeline(value: unknown, userId: string): readonly ReadTimelineEvent[] {
  const allowed = ["submission_accepted", "project_stage_changed", "project_visibility_changed", "investor_interest_expressed"];
  const sources = list(value).map(object).filter((source) => {
    if (!allowed.some((action) => action === source.action)) return false;
    return source.action !== "investor_interest_expressed" ||
      source.actor_user_id === undefined || source.actor_user_id === userId;
  });
  return uniqueById(sources.map((source) => ({
    id: id(source.id),
    action: text(source.action),
    fromValue: text(source.from_value),
    toValue: text(source.to_value),
    createdAt: timestamp(source.created_at),
  })));
}

export function acknowledgements(value: unknown, projectId: string | null): readonly ReadAcknowledgement[] | null {
  if (value == null) return null;
  return uniqueById(list(value).map((raw) => {
    const source = object(raw);
    const linkedProject = id(source.project_id);
    requireSame(linkedProject, projectId);
    return {
      id: id(source.id),
      projectId: linkedProject,
      userId: optionalId(source.user_id),
      agreementKey: text(source.agreement_key),
      typedName: text(source.typed_name),
      acknowledgedAt: timestamp(source.acknowledged_at),
    };
  }));
}

export function investorRoom(value: unknown, projectId: string, identity: IdentityFields) {
  const source = object(value);
  const rawProject = object(source.project);
  requireSame(id(rawProject.id), projectId);
  const rawSite = object(source.site);
  const project: ReadInvestorProject = {
    id: projectId,
    name: text(rawProject.name),
    stage: choice(rawProject.stage, projectStages),
    estimatedCapacityKw: number(rawProject.estimated_capacity_kw),
    createdAt: timestamp(rawProject.created_at),
    updatedAt: timestamp(rawProject.updated_at),
  };
  const site: ReadInvestorSite = {
    locality: text(rawSite.locality),
    siteType: choice(rawSite.site_type, siteTypes),
    ownershipStatus: text(rawSite.ownership_status),
    approximateAreaSqm: number(rawSite.approximate_area_sqm),
    electricityUsageKwhAnnual: number(rawSite.electricity_usage_kwh_annual),
    hasExistingSolar: boolean(rawSite.has_existing_solar),
  };
  const assessments = assessmentHistory(source, investorAssessment);
  const current = assessments.current;
  const summary: ReadRecord = {
    ...record({
      name: project.name,
      locality: site.locality,
      site_type: site.siteType,
      project_stage: project.stage,
      journey_stage_id: source.journey_stage_id,
      estimated_capacity_kw: project.estimatedCapacityKw,
      updated_at: project.updatedAt,
    }, { id: projectId, siteId: null, projectId, detail: { kind: "deal-room", projectId } }),
    estimatedSystemSizeKw: current?.estimatedSystemSizeKw ?? capacityRange({}),
    estimatedAnnualGenerationKwh: current?.estimatedAnnualGenerationKwh ?? energyRange({}),
    preliminaryProjectType: current?.preliminaryProjectType ?? null,
    viabilityStatus: current?.viabilityStatus ?? null,
  };
  return {
    record: summary,
    site,
    project,
    assessments,
    documents: investorDocuments(source.documents),
    timeline: investorTimeline(source.timeline, identity.userId),
  };
}

export function exportProjects(value: unknown, identity: IdentityFields): readonly ReadExportProject[] {
  const investor = identity.role === "investor";
  const rows = list(value).map((raw) => {
    const source = object(raw);
    const siteId = investor ? null : optionalId(source.site_id);
    const projectId = optionalId(source.project_id);
    if (siteId === null && projectId === null) malformed();
    return {
      siteId,
      projectId,
      name: text(source.name),
      address: investor ? null : text(source.address),
      locality: text(source.locality),
      siteType: choice(source.site_type, siteTypes),
      submissionStatus: investor ? null : choice(source.submission_status, submissionStatuses),
      projectStage: choice(source.project_stage, projectStages),
      journeyStageId: choice(source.journey_stage_id, journeyStages),
      viabilityStatus: choice(source.viability_status, viabilityStatuses),
      estimatedSystemSizeKw: capacityRange(source),
      estimatedAnnualGenerationKwh: energyRange(source),
      updatedAt: investor ? null : timestamp(source.updated_at),
    };
  });
  if (new Set(rows.map((entry) => `${entry.siteId}:${entry.projectId}`)).size !== rows.length) malformed();
  return rows;
}

export function exportDocuments(
  value: unknown,
  identity: IdentityFields,
  admitBytes: boolean,
  released: ReadonlyMap<string, ReadInvestorDocument>,
  projects: readonly ReadExportProject[],
): readonly ReadExportDocument[] {
  const sources = list(value).map(object);
  if (identity.role === "investor") {
    // The wire export omits a document's project association. Only a separately
    // confirmed deal-room release can admit that document, never an inferred tier.
    return uniqueById(sources.flatMap((source) => {
      const admitted = released.get(id(source.id));
      if (admitted === undefined) return [];
      return [{
        id: admitted.id,
        fileName: admitted.fileName,
        contentType: admitted.contentType,
        sizeBytes: admitted.sizeBytes,
        docType: admitted.docType,
        createdAt: admitted.createdAt,
        siteId: null,
        projectId: null,
        download: null,
      }];
    }));
  }
  const linkedProjects = projects.filter((project) => project.projectId !== null);
  const projectSites = new Map(linkedProjects.map((project) => [project.projectId, project.siteId]));
  if (projectSites.size !== linkedProjects.length) malformed();
  return uniqueById(sources.map((source) => {
    const metadata = documentMetadata(source);
    const exportedSiteId = optionalId(source.site_id);
    const projectId = optionalId(source.project_id);
    if (projectId !== null && (!projectSites.has(projectId) ||
      (exportedSiteId !== null && projectSites.get(projectId) !== exportedSiteId))) {
      rejectRead("denied", "The exported document does not match a project in the admitted manifest.", "scope_mismatch");
    }
    // The pinned exporter fills site_id from the enclosing site even for a
    // project-only document. That fallback is not a content-route capability.
    const siteId = projectId === null ? exportedSiteId : null;
    if (siteId === null && projectId === null) malformed();
    return {
      ...metadata,
      siteId,
      projectId,
      download: admitBytes && siteId !== null &&
        documentContentTypes.some((type) => type === metadata.contentType) &&
        (metadata.sizeBytes === null || metadata.sizeBytes <= LIVE_READ_LIMITS.downloadBytes) ? {
          siteId,
          documentId: metadata.id,
          fileName: metadata.fileName,
          contentType: metadata.contentType,
          sizeBytes: metadata.sizeBytes,
        } : null,
    };
  }));
}
