import type { ActivityRecord } from "../activity";
import type { EngagementRecord, FundingNeedRecord } from "../engagements";
import { MOCK_PROJECTS, type ProjectRecord, type ProjectStore } from "../projects";
import { isFailedResult } from "../shared";
import type {
  AcknowledgementRecord,
  AssessmentRecord,
  DocumentRecord,
  SiteRecord,
  UserRecord,
} from "../sites";
import {
  DEMO_INVESTOR_USER_ID,
  DEMO_OPERATOR_USER_ID,
  DEMO_SITE_OWNER_USER_ID,
} from "../../demo-principals";

export interface BackendStore extends ProjectStore {
  getSite(id: string): Promise<SiteRecord | null>;
  listSites(): Promise<readonly SiteRecord[]>;
  addSite(site: SiteRecord): Promise<void>;
  updateSite(site: SiteRecord): Promise<void>;
  listAssessments(siteId: string): Promise<readonly AssessmentRecord[]>;
  addAssessment(assessment: AssessmentRecord): Promise<void>;
  getProject(id: string): Promise<ProjectRecord | null>;
  getProjectBySite(siteId: string): Promise<ProjectRecord | null>;
  addProject(project: ProjectRecord): Promise<void>;
  updateProject(project: ProjectRecord): Promise<void>;
  addActivity(activity: ActivityRecord): Promise<void>;
  listActivity(projectId: string): Promise<readonly ActivityRecord[]>;
  listSiteActivity(siteId: string): Promise<readonly ActivityRecord[]>;
  listEngagements(projectId: string): Promise<readonly EngagementRecord[]>;
  findEngagement(
    investorId: string,
    projectId: string,
    fundingNeedId: string | null,
  ): Promise<EngagementRecord | null>;
  addEngagement(engagement: EngagementRecord): Promise<void>;
  getFundingNeed(id: string): Promise<FundingNeedRecord | null>;
  addFundingNeed(fundingNeed: FundingNeedRecord): Promise<void>;
  listDocuments(siteId: string, projectId: string | null): Promise<readonly DocumentRecord[]>;
  addDocument(document: DocumentRecord): Promise<void>;
  listAcknowledgements(projectId: string): Promise<readonly AcknowledgementRecord[]>;
  getUser(id: string): Promise<UserRecord | null>;
  transaction<T>(operation: (store: BackendStore) => Promise<T>): Promise<T>;
  nextId(prefix: string): string;
}

interface StoreState {
  sites: SiteRecord[];
  assessments: AssessmentRecord[];
  projects: ProjectRecord[];
  activities: ActivityRecord[];
  engagements: EngagementRecord[];
  fundingNeeds: FundingNeedRecord[];
  documents: DocumentRecord[];
  acknowledgements: AcknowledgementRecord[];
  users: UserRecord[];
}

export interface MemoryStoreOptions {
  readonly seedDemoProjects?: boolean;
}

const DEMO_CREATED_AT = "2026-09-01T00:00:00.000Z";

export function demoAssessmentId(projectIndex: number): string {
  return `a5500000-0000-4000-8000-${(projectIndex + 1)
    .toString(16)
    .padStart(12, "0")}`;
}

export function demoFundingNeedId(
  projectIndex: number,
  needIndex: number,
): string {
  return `f5500000-${(projectIndex + 1)
    .toString(16)
    .padStart(4, "0")}-4000-8000-${(needIndex + 1)
    .toString(16)
    .padStart(12, "0")}`;
}

export const DEMO_DOCUMENT_ID = "d5500000-0000-4000-8000-000000000001";

function demoState(seedDemoProjects: boolean): StoreState {
  const projects = seedDemoProjects
    ? MOCK_PROJECTS.map((project) => ({
        ...project,
        assignedOperatorUserId: DEMO_OPERATOR_USER_ID,
        nextAction: null,
        targetDate: null,
        createdAt: DEMO_CREATED_AT,
        updatedAt: DEMO_CREATED_AT,
      }))
    : [];

  const sites: SiteRecord[] = projects.map((project) => ({
    id: project.siteId,
    ownerUserId: project.ownerUserId,
    addressRaw: project.siteAddressRaw,
    latitude: project.siteLatitude,
    longitude: project.siteLongitude,
    geocodeConfidence: 0.99,
    siteType: project.siteType,
    ownershipStatus: "confirmed",
    approximateAreaSqm: null,
    electricityUsageKwhAnnual: null,
    electricityBillDocId: null,
    hasExistingSolar: false,
    consentGivenAt: DEMO_CREATED_AT,
    submissionStatus: "accepted",
    createdAt: DEMO_CREATED_AT,
    updatedAt: DEMO_CREATED_AT,
  }));

  const assessments: AssessmentRecord[] = projects.map((project, index) => ({
    id: demoAssessmentId(index),
    siteId: project.siteId,
    rulesetVersion: "demo-fixture-v1",
    inputsUsed: { fixture: true },
    estimatedSystemSizeKwLow: project.estimatedSystemSizeKwLow,
    estimatedSystemSizeKwHigh: project.estimatedSystemSizeKwHigh,
    estimatedAnnualGenerationKwhLow: project.estimatedAnnualGenerationKwhLow,
    estimatedAnnualGenerationKwhHigh: project.estimatedAnnualGenerationKwhHigh,
    preliminaryProjectType: project.preliminaryProjectType,
    viabilityStatus: project.viabilityStatus,
    flags: [],
    missingInformation: [],
    isOverride: false,
    overrideReason: null,
    overriddenByUserId: null,
    createdAt: DEMO_CREATED_AT,
  }));

  return {
    sites,
    assessments,
    projects,
    activities: [],
    engagements: [],
    fundingNeeds: projects.flatMap((project, projectIndex) =>
      Array.from({ length: project.openFundingNeedsCount }, (_, needIndex) => ({
        id: demoFundingNeedId(projectIndex, needIndex),
        projectId: project.id,
        needType: "feasibility_study",
        stage: project.stage,
        description: "Demo-only funding need.",
        amountRequested: null,
        amountCommitted: null,
        status: "open" as const,
        createdAt: DEMO_CREATED_AT,
      })),
    ),
    documents: projects.slice(0, 1).map((project) => ({
      id: DEMO_DOCUMENT_ID,
      siteId: project.siteId,
      projectId: project.id,
      blobPath: "private/demo/document.pdf",
      originalFilename: "site-summary.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      docType: "site_summary",
      disclosureClass: "investor_tier_1",
      uploadedByUserId: DEMO_OPERATOR_USER_ID,
      createdAt: DEMO_CREATED_AT,
    })),
    acknowledgements: [],
    users: [
      {
        id: DEMO_SITE_OWNER_USER_ID,
        name: "Demo Site Owner",
        email: "owner@example.invalid",
        role: "site_owner",
        createdAt: DEMO_CREATED_AT,
      },
      {
        id: DEMO_OPERATOR_USER_ID,
        name: "Demo Operator",
        email: "operator@example.invalid",
        role: "operator",
        createdAt: DEMO_CREATED_AT,
      },
      {
        id: DEMO_INVESTOR_USER_ID,
        name: "Demo Investor",
        email: "investor@example.invalid",
        role: "investor",
        createdAt: DEMO_CREATED_AT,
      },
    ],
  };
}

class MemoryBackendStore implements BackendStore {
  private state: StoreState;
  private readonly sequenceState: { value: number };
  private transactionQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly options: MemoryStoreOptions,
    state?: StoreState,
    sequenceState: { value: number } = { value: 0 },
  ) {
    this.state = state ?? demoState(options.seedDemoProjects ?? false);
    this.sequenceState = sequenceState;
  }

  reset(): void {
    this.state = demoState(this.options.seedDemoProjects ?? false);
    this.sequenceState.value = 0;
  }

  nextId(prefix: string): string {
    void prefix;
    this.sequenceState.value += 1;
    return `00000000-0000-4000-8000-${this.sequenceState.value
      .toString(16)
      .padStart(12, "0")}`;
  }

  listProjects(): Promise<readonly ProjectRecord[]> {
    return Promise.resolve(this.state.projects);
  }

  getProject(id: string): Promise<ProjectRecord | null> {
    return Promise.resolve(this.state.projects.find((item) => item.id === id) ?? null);
  }

  getProjectBySite(siteId: string): Promise<ProjectRecord | null> {
    return Promise.resolve(
      this.state.projects.find((item) => item.siteId === siteId) ?? null,
    );
  }

  addProject(project: ProjectRecord): Promise<void> {
    return this.mutate(() => this.state.projects.push(project));
  }

  updateProject(project: ProjectRecord): Promise<void> {
    return this.mutate(() => this.replace(this.state.projects, project));
  }

  getSite(id: string): Promise<SiteRecord | null> {
    return Promise.resolve(this.state.sites.find((item) => item.id === id) ?? null);
  }

  listSites(): Promise<readonly SiteRecord[]> {
    return Promise.resolve(this.state.sites);
  }

  addSite(site: SiteRecord): Promise<void> {
    return this.mutate(() => this.state.sites.push(site));
  }

  updateSite(site: SiteRecord): Promise<void> {
    return this.mutate(() => this.replace(this.state.sites, site));
  }

  listAssessments(siteId: string): Promise<readonly AssessmentRecord[]> {
    return Promise.resolve(
      this.state.assessments.filter((item) => item.siteId === siteId),
    );
  }

  addAssessment(assessment: AssessmentRecord): Promise<void> {
    return this.mutate(() => this.state.assessments.push(assessment));
  }

  addActivity(activity: ActivityRecord): Promise<void> {
    return this.mutate(() => this.state.activities.push(activity));
  }

  listActivity(projectId: string): Promise<readonly ActivityRecord[]> {
    return Promise.resolve(
      this.state.activities.filter((item) => item.projectId === projectId),
    );
  }

  listSiteActivity(siteId: string): Promise<readonly ActivityRecord[]> {
    return Promise.resolve(
      this.state.activities.filter((item) => item.siteId === siteId),
    );
  }

  listEngagements(projectId: string): Promise<readonly EngagementRecord[]> {
    return Promise.resolve(
      this.state.engagements.filter((item) => item.projectId === projectId),
    );
  }

  findEngagement(
    investorId: string,
    projectId: string,
    fundingNeedId: string | null,
  ): Promise<EngagementRecord | null> {
    return Promise.resolve(
      this.state.engagements.findLast(
        (item) =>
          item.investorId === investorId &&
          item.projectId === projectId &&
          item.fundingNeedId === fundingNeedId,
      ) ?? null,
    );
  }

  addEngagement(engagement: EngagementRecord): Promise<void> {
    return this.mutate(() => this.state.engagements.push(engagement));
  }

  getFundingNeed(id: string): Promise<FundingNeedRecord | null> {
    return Promise.resolve(
      this.state.fundingNeeds.find((item) => item.id === id) ?? null,
    );
  }

  addFundingNeed(fundingNeed: FundingNeedRecord): Promise<void> {
    return this.mutate(() => this.state.fundingNeeds.push(fundingNeed));
  }

  listDocuments(
    siteId: string,
    projectId: string | null,
  ): Promise<readonly DocumentRecord[]> {
    return Promise.resolve(
      this.state.documents.filter(
        (item) =>
          item.siteId === siteId ||
          (projectId !== null && item.projectId === projectId),
      ),
    );
  }

  addDocument(document: DocumentRecord): Promise<void> {
    return this.mutate(() => this.state.documents.push(document));
  }

  listAcknowledgements(
    projectId: string,
  ): Promise<readonly AcknowledgementRecord[]> {
    return Promise.resolve(
      this.state.acknowledgements.filter((item) => item.projectId === projectId),
    );
  }

  getUser(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.state.users.find((item) => item.id === id) ?? null);
  }

  async transaction<T>(
    operation: (store: BackendStore) => Promise<T>,
  ): Promise<T> {
    return this.runExclusive(async () => {
      const workingStore = new MemoryBackendStore(
        this.options,
        structuredClone(this.state),
        this.sequenceState,
      );
      const result = await operation(workingStore);
      if (!isFailedResult(result)) {
        this.state = workingStore.state;
      }
      return result;
    });
  }

  private replace<T extends { id: string }>(items: T[], replacement: T): void {
    const index = items.findIndex((item) => item.id === replacement.id);
    if (index >= 0) items[index] = replacement;
  }

  private async mutate(operation: () => unknown): Promise<void> {
    await this.runExclusive(() => {
      operation();
      return Promise.resolve();
    });
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.transactionQueue;
    let release = (): void => undefined;
    this.transactionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export function createMemoryBackendStore(
  options: MemoryStoreOptions = {},
): BackendStore {
  return new MemoryBackendStore(options);
}

const demoMemoryStore = new MemoryBackendStore({ seedDemoProjects: true });
export const demoBackendStore: BackendStore = demoMemoryStore;

export function resetDemoBackendStore(): void {
  demoMemoryStore.reset();
}
