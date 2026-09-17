import type { SiteType, ViabilityStatus } from "../projects";

export const OWNERSHIP_STATUSES = ["confirmed", "pending", "unverified"] as const;
export type OwnershipStatus = (typeof OWNERSHIP_STATUSES)[number];

export function isOwnershipStatus(value: string): value is OwnershipStatus {
  return OWNERSHIP_STATUSES.some((status) => status === value);
}

export const SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "screening",
  "info_requested",
  "accepted",
  "rejected",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export function isSubmissionStatus(value: string): value is SubmissionStatus {
  return SUBMISSION_STATUSES.some((status) => status === value);
}

export interface SiteRecord {
  id: string;
  ownerUserId: string;
  addressRaw: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeConfidence: number | null;
  siteType: SiteType | null;
  ownershipStatus: OwnershipStatus | null;
  approximateAreaSqm: number | null;
  electricityUsageKwhAnnual: number | null;
  electricityBillDocId: string | null;
  hasExistingSolar: boolean | null;
  consentGivenAt: string | null;
  submissionStatus: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentRecord {
  id: string;
  siteId: string;
  rulesetVersion: string;
  inputsUsed: Readonly<Record<string, unknown>>;
  estimatedSystemSizeKwLow: number | null;
  estimatedSystemSizeKwHigh: number | null;
  estimatedAnnualGenerationKwhLow: number | null;
  estimatedAnnualGenerationKwhHigh: number | null;
  preliminaryProjectType: string | null;
  viabilityStatus: ViabilityStatus;
  flags: readonly string[];
  missingInformation: readonly string[];
  isOverride: boolean;
  overrideReason: string | null;
  overriddenByUserId: string | null;
  createdAt: string;
}

export interface SiteUpdateInput {
  readonly addressRaw?: string | null;
  readonly siteType?: SiteType | null;
  readonly ownershipStatus?: OwnershipStatus | null;
  readonly approximateAreaSqm?: number | null;
  readonly electricityUsageKwhAnnual?: number | null;
  readonly electricityBillDocId?: string | null;
  readonly hasExistingSolar?: boolean | null;
  readonly consentGiven?: boolean;
}

export interface SiteCreateInput {
  readonly addressRaw?: string;
  readonly siteType?: SiteType;
  readonly ownershipStatus?: OwnershipStatus;
  readonly approximateAreaSqm?: number;
  readonly electricityUsageKwhAnnual?: number;
  readonly electricityBillDocId?: string;
  readonly hasExistingSolar?: boolean;
  readonly consentGiven?: boolean;
  readonly submit: boolean;
}

export interface MissingField {
  readonly field: string;
  readonly message: string;
}

export interface ViabilityAssessmentInput {
  readonly site: SiteRecord;
}

export type ViabilityAssessmentResult = Omit<
  AssessmentRecord,
  "id" | "siteId" | "createdAt" | "isOverride" | "overrideReason" | "overriddenByUserId"
>;

export interface ViabilityClient {
  assess(input: ViabilityAssessmentInput): Promise<ViabilityAssessmentResult>;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: "site_owner" | "operator" | "investor";
  createdAt: string;
}

export const DOCUMENT_DISCLOSURE_CLASSES = [
  "owner_private",
  "investor_tier_1",
] as const;
export type DocumentDisclosureClass =
  (typeof DOCUMENT_DISCLOSURE_CLASSES)[number];

export interface DocumentRecord {
  id: string;
  siteId: string | null;
  projectId: string | null;
  /** `{container}/{blobName}` — see `core/documents/storage.ts`. */
  blobPath: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  /**
   * Never null: `documents.doc_type` is `text NOT NULL` with no column default,
   * so an upload that omits it is resolved to `other` rather than carried as
   * null into a record the database would reject.
   */
  docType: string;
  disclosureClass: DocumentDisclosureClass;
  uploadedByUserId: string;
  createdAt: string;
}

export interface AcknowledgementRecord {
  id: string;
  projectId: string;
  userId: string;
  agreementKey: string;
  typedName: string;
  acknowledgedAt: string;
  ipAddress: string | null;
}
