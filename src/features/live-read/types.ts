import type { ConnectionId, WS2_CONTRACT_REVISION } from "@/domain/connections";
import type { JourneyStageId } from "@/domain/journey";
import type { WorkspaceSourceMode } from "@/domain/live-configuration";
import type { ProjectStage, SiteType, SubmissionStatus, ViabilityStatus, WorkspaceQuery } from "@/domain/workspace-filters";

export type { LiveReadConfiguration } from "@/domain/live-configuration";
export type { JourneyStageId } from "@/domain/journey";
export type { ProjectStage, SiteType, SubmissionStatus, ViabilityStatus } from "@/domain/workspace-filters";

export type LiveRole = "site-owner" | "operator" | "investor";
export type EngagementState =
  | "interested"
  | "committed"
  | "underwriting"
  | "approved"
  | "funded"
  | "declined"
  | "withdrawn";
export type FundingStage =
  | "pre_development"
  | "development"
  | "construction"
  | "permanent";

export interface ReadError {
  readonly kind:
    | "out-of-reach"
    | "unauthenticated"
    | "denied"
    | "missing"
    | "invalid"
    | "malformed"
    | "network"
    | "timeout"
    | "canceled"
    | "stale"
    | "too-large"
    | "unavailable";
  readonly message: string;
  readonly status: number | null;
  readonly code: string | null;
  readonly connectionId: ConnectionId | null;
}

export type ReadResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ReadError };

// A correlation handle, not an authenticator or a permission grant.
export interface ReadScope {
  readonly userId: string;
  readonly role: LiveRole;
  readonly generation: number;
}

export interface ReadOptions {
  readonly signal?: AbortSignal;
}
export interface ScopedReadOptions extends ReadOptions {
  readonly scope: ReadScope;
}
export type SnapshotQuery = WorkspaceQuery;
export interface SnapshotReadOptions extends ReadOptions {
  readonly query?: SnapshotQuery;
  readonly scope?: ReadScope;
}
export type DetailReference =
  | { readonly kind: "owner-site"; readonly siteId: string }
  | { readonly kind: "submission"; readonly siteId: string }
  | {
      readonly kind: "project";
      readonly projectId: string;
      readonly siteId: string;
    }
  | { readonly kind: "deal-room"; readonly projectId: string };

export interface DocumentReference {
  readonly siteId: string;
  readonly documentId: string;
  readonly fileName: string | null;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
}

export interface ReadOperation {
  readonly connectionId: ConnectionId;
  readonly method: "GET";
  readonly path: string;
}
export interface ReadProvenance {
  readonly source: "WS2";
  readonly mode?: Exclude<WorkspaceSourceMode, "unavailable">;
  readonly store?: "database-configured" | "mock-configured";
  readonly contractRevision: typeof WS2_CONTRACT_REVISION;
  readonly deployedRevision: null;
  readonly retrievedAt: string;
  readonly operations: readonly ReadOperation[];
}
export interface LiveIdentity {
  readonly userId: string;
  readonly role: LiveRole;
  readonly onboarded: boolean | null;
  readonly investorId: string | null;
  readonly organizationName: string | null;
  readonly scope: ReadScope;
  readonly provenance: ReadProvenance;
}

export interface ReadRange<Unit extends string> {
  readonly low: number | null;
  readonly high: number | null;
  readonly unit: Unit;
}
export interface ReadRecord {
  readonly id: string;
  readonly siteId: string | null;
  readonly projectId: string | null;
  readonly name: string | null;
  readonly locality: string | null;
  readonly siteType: SiteType | null;
  readonly submissionStatus: SubmissionStatus | null;
  readonly projectStage: ProjectStage | null;
  readonly journeyStageId: JourneyStageId | null;
  readonly viabilityStatus: ViabilityStatus | null;
  readonly estimatedCapacityKw: number | null;
  readonly estimatedSystemSizeKw: ReadRange<"kW">;
  readonly estimatedAnnualGenerationKwh: ReadRange<"kWh/year">;
  readonly preliminaryProjectType: string | null;
  readonly engagementState: EngagementState | null;
  readonly openFundingNeedsCount: number | null;
  readonly updatedAt: string | null;
  readonly detail: DetailReference;
}
export interface OutstandingItem {
  readonly id: string;
  readonly source: string | null;
  readonly siteId: string;
  readonly projectId: string | null;
  readonly message: string | null;
  readonly createdAt: string | null;
}
export interface ReadPipelineColumn {
  readonly journeyStageId: JourneyStageId;
  readonly reportedCount: number | null;
  readonly records: readonly ReadRecord[];
}
export interface ReadPipeline {
  readonly columns: readonly ReadPipelineColumn[];
}
export interface ReadInvestorProfile {
  readonly id: string;
  readonly userId: string;
  readonly organizationName: string | null;
  readonly investorType: string | null;
  readonly capitalType: string | null;
  readonly fundingStageFocus: readonly FundingStage[] | null;
  readonly ticketSizeMin: number | null;
  readonly ticketSizeMax: number | null;
  readonly geographies: readonly string[] | null;
  readonly investmentObjectives: readonly string[] | null;
  readonly impactPriorities: readonly string[] | null;
  readonly decisionCriteria: readonly string[] | null;
  readonly dealRoomProfile: string | null;
  readonly visiblePortfolioScope: readonly string[] | null;
  readonly onboardingCompletedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
export interface ReadEngagement {
  readonly id: string;
  readonly projectId: string;
  readonly investorId: string;
  readonly fundingNeedId: string | null;
  readonly state: EngagementState | null;
  readonly stateChangedAt: string | null;
  readonly isBinding: boolean | null;
  readonly createdAt: string | null;
  readonly projectName: string | null;
  readonly projectStage: ProjectStage | null;
  readonly journeyStageId: JourneyStageId | null;
}
export interface ReadFundingNeed {
  readonly id: string;
  readonly projectId: string;
  readonly needType: string | null;
  readonly stage: FundingStage | null;
  readonly description: string | null;
  readonly amountRequested: number | null;
  readonly amountCommitted: number | null;
  readonly currency: null;
  readonly status: string | null;
  readonly createdAt: string | null;
}
export interface ReadSummary {
  readonly recordCount: number;
  readonly projectCount: number | null;
  readonly totalEstimatedCapacityKw: number | null;
  readonly mandateMatch: boolean | null;
}
interface SnapshotBase {
  readonly identity: LiveIdentity;
  readonly scope: ReadScope;
  readonly records: readonly ReadRecord[];
  readonly summary: ReadSummary;
  readonly completeness: "complete" | "partial";
  readonly provenance: ReadProvenance;
}
export interface OwnerSnapshot extends SnapshotBase {
  readonly role: "site-owner";
  readonly sites: readonly ReadRecord[];
  readonly outstanding: ReadResult<readonly OutstandingItem[]>;
}
export interface OperatorSnapshot extends SnapshotBase {
  readonly role: "operator";
  readonly submissions: readonly ReadRecord[];
  readonly pipeline: ReadResult<ReadPipeline>;
}
export interface InvestorSnapshot extends SnapshotBase {
  readonly role: "investor";
  readonly profile: ReadResult<ReadInvestorProfile>;
  readonly engagements: ReadResult<readonly ReadEngagement[]>;
}
export type LiveSnapshot = OwnerSnapshot | OperatorSnapshot | InvestorSnapshot;

export interface ReadPerson {
  readonly id: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly role: LiveRole | null;
  readonly createdAt: string | null;
}
export interface ReadPrivateSite {
  readonly id: string;
  readonly ownerUserId: string | null;
  readonly address: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly geocodeConfidence: number | null;
  readonly siteType: SiteType | null;
  readonly ownershipStatus: string | null;
  readonly approximateAreaSqm: number | null;
  readonly electricityUsageKwhAnnual: number | null;
  readonly hasExistingSolar: boolean | null;
  readonly consentGivenAt: string | null;
  readonly submissionStatus: SubmissionStatus | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
export interface ReadInvestorSite {
  readonly locality: string | null;
  readonly siteType: SiteType | null;
  readonly ownershipStatus: string | null;
  readonly approximateAreaSqm: number | null;
  readonly electricityUsageKwhAnnual: number | null;
  readonly hasExistingSolar: boolean | null;
}
export interface ReadPrivateProject {
  readonly id: string;
  readonly siteId: string;
  readonly name: string | null;
  readonly assignedOperatorUserId: string | null;
  readonly stage: ProjectStage | null;
  readonly estimatedCapacityKw: number | null;
  readonly nextAction: string | null;
  readonly targetDate: string | null;
  readonly visibleToInvestors: boolean | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
export interface ReadInvestorProject {
  readonly id: string;
  readonly name: string | null;
  readonly stage: ProjectStage | null;
  readonly estimatedCapacityKw: number | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
export interface ReadAssessmentInputs {
  readonly siteType: SiteType | null;
  readonly ownershipStatus: string | null;
  readonly approximateAreaSqm: number | null;
  readonly electricityUsageKwhAnnual: number | null;
  readonly hasExistingSolar: boolean | null;
}
export interface ReadInvestorAssessment {
  readonly id: string;
  readonly rulesetVersion: string | null;
  readonly estimatedSystemSizeKw: ReadRange<"kW">;
  readonly estimatedAnnualGenerationKwh: ReadRange<"kWh/year">;
  readonly preliminaryProjectType: string | null;
  readonly viabilityStatus: ViabilityStatus | null;
  readonly flags: readonly string[] | null;
  readonly missingInformation: readonly string[] | null;
  readonly isOverride: boolean | null;
  readonly createdAt: string | null;
}
export interface ReadPrivateAssessment extends ReadInvestorAssessment {
  readonly siteId: string;
  readonly inputsUsed: ReadAssessmentInputs | null;
  readonly overrideReason: string | null;
  readonly overriddenByUserId: string | null;
}
export interface ReadAssessmentHistory<T> {
  readonly current: T | null;
  readonly original: T | null;
  readonly human: T | null;
  readonly entries: readonly T[];
  readonly completeness: "complete" | "current-only" | "unavailable";
}
export interface ReadTimelineEvent {
  readonly id: string;
  readonly action: string | null;
  readonly fromValue: string | null;
  readonly toValue: string | null;
  readonly createdAt: string | null;
}
export interface ReadActivity extends ReadTimelineEvent {
  readonly siteId: string | null;
  readonly projectId: string | null;
  readonly actorUserId: string | null;
  readonly note: string | null;
}
interface DocumentMetadata {
  readonly id: string;
  readonly fileName: string | null;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly docType: string | null;
  readonly createdAt: string | null;
}
export interface ReadPrivateDocument extends DocumentMetadata {
  readonly disclosure: "owner-operator";
  readonly siteId: string | null;
  readonly projectId: string | null;
  readonly disclosureClass: string | null;
  readonly uploadedByUserId: string | null;
  readonly download: DocumentReference | null;
}
export interface ReadInvestorDocument extends DocumentMetadata {
  readonly disclosure: "investor-tier-1";
  readonly download: null;
}
export type ReadDocumentMetadata = ReadPrivateDocument | ReadInvestorDocument;
export interface ReadAcknowledgement {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string | null;
  readonly agreementKey: string | null;
  readonly typedName: string | null;
  readonly acknowledgedAt: string | null;
}
interface DetailBase {
  readonly identity: LiveIdentity;
  readonly scope: ReadScope;
  readonly record: ReadRecord;
  readonly completeness: "complete" | "partial";
  readonly provenance: ReadProvenance;
}
interface PrivateDetailBase extends DetailBase {
  readonly site: ReadPrivateSite;
  readonly project: ReadPrivateProject | null;
  readonly owner: ReadPerson | null;
  readonly assessments: ReadAssessmentHistory<ReadPrivateAssessment>;
  readonly documents: readonly ReadPrivateDocument[];
  readonly activity: readonly ReadActivity[] | null;
}
export interface OwnerDetail extends PrivateDetailBase {
  readonly role: "site-owner";
  readonly kind: "owner-site";
  readonly contact: ReadPerson | null;
  readonly outstanding: readonly OutstandingItem[] | null;
  readonly acknowledgements: readonly ReadAcknowledgement[] | null;
}
export interface OperatorDetail extends PrivateDetailBase {
  readonly role: "operator";
  readonly kind: "submission" | "project";
  readonly engagements: ReadResult<readonly ReadEngagement[]> | null;
  readonly fundingNeeds: ReadResult<readonly ReadFundingNeed[]> | null;
}
export interface InvestorDetail extends DetailBase {
  readonly role: "investor";
  readonly kind: "deal-room";
  readonly disclosureTier: 1;
  readonly site: ReadInvestorSite;
  readonly project: ReadInvestorProject;
  readonly assessments: ReadAssessmentHistory<ReadInvestorAssessment>;
  readonly documents: readonly ReadInvestorDocument[];
  readonly timeline: readonly ReadTimelineEvent[];
  readonly fundingNeeds: ReadResult<readonly ReadFundingNeed[]>;
}
export type LiveDetail = OwnerDetail | OperatorDetail | InvestorDetail;

export interface ReadDownload {
  readonly blob: Blob;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly provenance: ReadProvenance;
}
export interface ReadExportProject {
  readonly siteId: string | null;
  readonly projectId: string | null;
  readonly name: string | null;
  readonly address: string | null;
  readonly locality: string | null;
  readonly siteType: SiteType | null;
  readonly submissionStatus: SubmissionStatus | null;
  readonly projectStage: ProjectStage | null;
  readonly journeyStageId: JourneyStageId | null;
  readonly viabilityStatus: ViabilityStatus | null;
  readonly estimatedSystemSizeKw: ReadRange<"kW">;
  readonly estimatedAnnualGenerationKwh: ReadRange<"kWh/year">;
  readonly updatedAt: string | null;
}
export interface ReadExportDocument extends DocumentMetadata {
  readonly siteId: string | null;
  readonly projectId: string | null;
  readonly download: DocumentReference | null;
}
export interface LiveExportManifest {
  readonly identity: LiveIdentity;
  readonly scope: ReadScope;
  readonly scopeLabel: string | null;
  readonly generatedAt: string | null;
  readonly reportedProjectCount: number | null;
  readonly reportedDocumentCount: number | null;
  readonly projects: readonly ReadExportProject[];
  readonly documents: readonly ReadExportDocument[];
  readonly provenance: ReadProvenance;
}
export interface LiveReadClientOptions {
  readonly origin?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
}
export interface LiveReadClient {
  readIdentity(options?: ReadOptions): Promise<ReadResult<LiveIdentity>>;
  readSnapshot(options?: SnapshotReadOptions): Promise<ReadResult<LiveSnapshot>>;
  readDetail(
    reference: DetailReference,
    options: ScopedReadOptions,
  ): Promise<ReadResult<LiveDetail>>;
  readDocument(
    reference: DocumentReference,
    options: ScopedReadOptions,
  ): Promise<ReadResult<ReadDownload>>;
  readExport(options: ScopedReadOptions): Promise<ReadResult<LiveExportManifest>>;
  invalidate(): void;
}

export interface ReadEngagements {
  readonly identity: LiveIdentity;
  readonly scope: ReadScope;
  readonly engagements: readonly ReadEngagement[];
  readonly provenance: ReadProvenance;
}

export interface InterestOptions extends ScopedReadOptions {
  readonly acknowledgeUnknownOutcome?: boolean;
}

export interface InterestReceipt {
  readonly method: "POST";
  readonly path: string;
  readonly projectId: string;
  readonly investorId: string;
  readonly scope: ReadScope;
  readonly mode: "connected" | "server-demo";
  readonly dispatched: boolean;
  readonly observedAt: string;
  readonly contractRevision: typeof WS2_CONTRACT_REVISION;
  readonly deployedRevision: null;
}

export type InterestResult =
  | { readonly kind: "created"; readonly receipt: InterestReceipt; readonly engagement: ReadEngagement }
  | { readonly kind: "existing"; readonly receipt: InterestReceipt; readonly engagement: ReadEngagement | null }
  | {
      readonly kind: "not-sent" | "refused" | "unknown";
      readonly receipt: InterestReceipt | null;
      readonly error: ReadError;
    };

export interface WorkspaceClient extends LiveReadClient {
  readMyEngagements(options: ScopedReadOptions): Promise<ReadResult<ReadEngagements>>;
  expressInterest(projectId: string, options: InterestOptions): Promise<InterestResult>;
}
