import type { ActivityRecord } from "../activity";
import type { EngagementRecord, FundingNeedRecord } from "../engagements";
import {
  fundingStageForProject,
  MOCK_PROJECTS,
  type ProjectRecord,
  type ProjectStore,
} from "../projects";
import { isFailedResult } from "../shared";
import type { InvestorProfile } from "../identity";
import type {
  AcknowledgementRecord,
  AssessmentRecord,
  DocumentRecord,
  SiteRecord,
  UserRecord,
} from "../sites";
import {
  DEMO_INVESTOR_ID,
  DEMO_INVESTOR_USER_ID,
  DEMO_OPERATOR_USER_ID,
  DEMO_SITE_OWNER_BROOKS_USER_ID,
  DEMO_SITE_OWNER_THOMPSON_USER_ID,
  DEMO_SITE_OWNER_USER_ID,
  DEMO_SITE_OWNER_WEBB_USER_ID,
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
  listFundingNeeds(projectId: string): Promise<readonly FundingNeedRecord[]>;
  addFundingNeed(fundingNeed: FundingNeedRecord): Promise<void>;
  listDocuments(siteId: string, projectId: string | null): Promise<readonly DocumentRecord[]>;
  addDocument(document: DocumentRecord): Promise<void>;
  listAcknowledgements(projectId: string): Promise<readonly AcknowledgementRecord[]>;
  getUser(id: string): Promise<UserRecord | null>;
  getInvestorProfileByUserId(userId: string): Promise<InvestorProfile | null>;
  upsertInvestorProfile(profile: InvestorProfile): Promise<void>;
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
  investorProfiles: InvestorProfile[];
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
        stage: fundingStageForProject(project.stage),
        description: "Demo-only funding need.",
        amountRequested: null,
        amountCommitted: 0,
        status: "open" as const,
        createdAt: DEMO_CREATED_AT,
      })),
    ),
    documents: projects.slice(0, 1).map((project) => ({
      id: DEMO_DOCUMENT_ID,
      siteId: null,
      projectId: project.id,
      /**
       * Built by hand rather than through `buildDocumentBlobLocation` because
       * `core/documents` imports this module for `demoBackendStore`, so
       * importing it back would be a cycle. A conformance test asserts this
       * string still matches what the builder produces, so the layout cannot
       * drift here unnoticed.
       */
      blobPath:
        "project-documents/owners/" +
        DEMO_SITE_OWNER_USER_ID +
        "/projects/" +
        project.id +
        "/site_summary/" +
        DEMO_DOCUMENT_ID +
        "/site-summary.pdf",
      originalFilename: "site-summary.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      docType: "site_summary",
      disclosureClass: "investor_tier_1",
      uploadedByUserId: DEMO_OPERATOR_USER_ID,
      createdAt: DEMO_CREATED_AT,
    })),
    acknowledgements: [],
    investorProfiles: seedDemoProjects
      ? [
          {
            id: DEMO_INVESTOR_ID,
            userId: DEMO_INVESTOR_USER_ID,
            organizationName: "Demo Community Endowment",
            investorType: "special_community_endowment",
            capitalType: "grant",
            fundingStageFocus: ["pre_development", "development", "construction"],
            ticketSizeMin: null,
            ticketSizeMax: null,
            geographies: ["GA"],
            investmentObjectives: [],
            impactPriorities: [],
            decisionCriteria: [],
            dealRoomProfile: "default",
            visiblePortfolioScope: [],
            onboardingCompletedAt: DEMO_CREATED_AT,
            createdAt: DEMO_CREATED_AT,
            updatedAt: DEMO_CREATED_AT,
          },
        ]
      : [],
    /**
     * The same six people as `db/seed.sql`, with the same ids, names, emails
     * and roles.
     *
     * Three of them are site owners the fixtures do not use as a primary demo
     * principal but do reference as project owners; without rows here those
     * references dangle, `getUser` answers null where PostgreSQL answers a
     * person, and the two stores stop being substitutable. The names and
     * emails match the seed for the same reason — anything rendered from a
     * user row would otherwise change when the store changed.
     */
    users: [
      {
        id: DEMO_SITE_OWNER_USER_ID,
        name: "Ava Mitchell",
        email: "ava.mitchell@example.org",
        role: "site_owner",
        createdAt: DEMO_CREATED_AT,
      },
      {
        id: DEMO_SITE_OWNER_WEBB_USER_ID,
        name: "Marcus Webb",
        email: "marcus.webb@example.org",
        role: "site_owner",
        createdAt: DEMO_CREATED_AT,
      },
      {
        id: DEMO_SITE_OWNER_THOMPSON_USER_ID,
        name: "Ray Thompson",
        email: "ray.thompson@example.org",
        role: "site_owner",
        createdAt: DEMO_CREATED_AT,
      },
      {
        id: DEMO_SITE_OWNER_BROOKS_USER_ID,
        name: "Lena Brooks",
        email: "lena.brooks@example.org",
        role: "site_owner",
        createdAt: DEMO_CREATED_AT,
      },
      {
        id: DEMO_OPERATOR_USER_ID,
        name: "Jordan Ellis",
        email: "jordan.ellis@example.org",
        role: "operator",
        createdAt: DEMO_CREATED_AT,
      },
      {
        id: DEMO_INVESTOR_USER_ID,
        name: "Priya Raman",
        email: "priya.raman@example.org",
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
    return Promise.resolve(
      this.state.projects.map((project) => this.withLatestAssessment(project)),
    );
  }

  getProject(id: string): Promise<ProjectRecord | null> {
    const project = this.state.projects.find((item) => item.id === id);
    return Promise.resolve(
      project === undefined ? null : this.withLatestAssessment(project),
    );
  }

  getProjectBySite(siteId: string): Promise<ProjectRecord | null> {
    const project = this.state.projects.find((item) => item.siteId === siteId);
    return Promise.resolve(
      project === undefined ? null : this.withLatestAssessment(project),
    );
  }

  /**
   * Project rows carry a copy of the screening result, and the copy is derived
   * rather than stored — exactly as `DatabaseBackendStore` derives it, with a
   * `selectDistinctOn` over the site's assessments ordered by `created_at DESC,
   * id DESC`.
   *
   * Reading it straight off the stored record was correct only while
   * assessments never changed after they were written. `overrideAssessment`
   * appends a new one, so a stored copy goes stale the moment an operator
   * overrides a result — and it goes stale *here only*, leaving PostgreSQL
   * reporting the override while the in-memory store reported the screening it
   * replaced. The two stores are required to answer identically, and the
   * divergence would have shown up as an investor portfolio that disagreed with
   * the operator's own decision.
   */
  private withLatestAssessment(project: ProjectRecord): ProjectRecord {
    const latest = this.state.assessments
      .filter((item) => item.siteId === project.siteId)
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? b.id.localeCompare(a.id)
          : b.createdAt.localeCompare(a.createdAt),
      )
      .at(0);

    if (latest === undefined) return project;

    return {
      ...project,
      preliminaryProjectType: latest.preliminaryProjectType,
      /**
       * A project with no assessment keeps whatever the record already held;
       * the database answers `more_information_required` for that case in
       * `toProjectRecord`, and it is reached there through a LEFT JOIN rather
       * than through this branch.
       */
      viabilityStatus: latest.viabilityStatus,
      estimatedSystemSizeKwLow: latest.estimatedSystemSizeKwLow,
      estimatedSystemSizeKwHigh: latest.estimatedSystemSizeKwHigh,
      estimatedAnnualGenerationKwhLow: latest.estimatedAnnualGenerationKwhLow,
      estimatedAnnualGenerationKwhHigh: latest.estimatedAnnualGenerationKwhHigh,
    };
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

  /**
   * Activity rows carry exactly one parent, so a project's history is split
   * between rows parented to the project and the pre-project rows parented to
   * its site. Both readers join across that boundary and sort by time, so a
   * caller still sees one continuous history without any row having to name two
   * parents.
   */
  async listActivity(projectId: string): Promise<readonly ActivityRecord[]> {
    const project = this.state.projects.find((item) => item.id === projectId);
    return sortedByCreatedAt(
      this.state.activities.filter(
        (item) =>
          item.projectId === projectId ||
          (project !== undefined && item.siteId === project.siteId),
      ),
    );
  }

  async listSiteActivity(siteId: string): Promise<readonly ActivityRecord[]> {
    const project = this.state.projects.find((item) => item.siteId === siteId);
    return sortedByCreatedAt(
      this.state.activities.filter(
        (item) =>
          item.siteId === siteId ||
          (project !== undefined && item.projectId === project.id),
      ),
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

  listFundingNeeds(projectId: string): Promise<readonly FundingNeedRecord[]> {
    return Promise.resolve(
      this.state.fundingNeeds.filter((item) => item.projectId === projectId),
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

  getInvestorProfileByUserId(userId: string): Promise<InvestorProfile | null> {
    return Promise.resolve(
      this.state.investorProfiles.find((item) => item.userId === userId) ?? null,
    );
  }

  upsertInvestorProfile(profile: InvestorProfile): Promise<void> {
    return this.mutate(() => {
      const index = this.state.investorProfiles.findIndex(
        (item) => item.userId === profile.userId,
      );
      if (index >= 0) {
        this.state.investorProfiles[index] = profile;
      } else {
        this.state.investorProfiles.push(profile);
      }
    });
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

/**
 * The demo fixtures, as a single instance per process.
 *
 * Pinned to `globalThis` rather than held in a module-level `const` because
 * Next.js compiles server components and route handlers into separate bundler
 * layers, and module state is not shared between them. Without this, a process
 * holds two copies of the fixtures: `POST /api/sites` writes to the route
 * handler's copy while a dashboard server component reads the other, so a site
 * submitted during a demo is accepted and then does not appear. Verified
 * directly — the API reported four sites while the page rendered two.
 *
 * Only the in-memory store needs this. PostgreSQL has no module state to
 * duplicate: both layers open their own pool onto the same database.
 *
 * `Symbol.for` rather than a string key so nothing else can collide with it,
 * and `??=` so the first layer to load wins and every later one joins it.
 */
const DEMO_STORE_KEY = Symbol.for("sunsum.demoMemoryStore");

interface DemoStoreGlobal {
  [DEMO_STORE_KEY]?: MemoryBackendStore;
}

const storeGlobal = globalThis as DemoStoreGlobal;
storeGlobal[DEMO_STORE_KEY] ??= new MemoryBackendStore({
  seedDemoProjects: true,
});
const demoMemoryStore: MemoryBackendStore = storeGlobal[DEMO_STORE_KEY];

/**
 * The in-memory fixtures, as a store.
 *
 * Exported so the composition root can name the thing it installs. Resolving
 * "mock" to {@link backendStore} instead would be circular — the proxy answers
 * with whatever is currently installed, so it would report PostgreSQL as the
 * mock store once PostgreSQL had been installed once.
 */
export const memoryBackendStore: BackendStore = demoMemoryStore;

/**
 * The store every handler actually talks to.
 *
 * It starts as the in-memory fixtures and stays that way unless the composition
 * root replaces it, so `npm run dev`, `npm test` and CI work with no database
 * and no `DATABASE_URL` at all — and forgetting to configure one produces the
 * demo data rather than a connection error.
 *
 * Indirection rather than a mutable binding, because a `let` exported from here
 * would be captured by value at import time: the twenty-odd handlers that hold
 * this as a default parameter all resolve it once, before `SUNSUM_STORE` has
 * been read, and would keep the fixtures forever. Reading through a proxy moves
 * that resolution to the call, which is the only moment the answer is known.
 *
 * `core` still never imports `db`. It does not learn which store it received —
 * only that something implementing the interface was installed.
 */
export const backendStore: BackendStore = new Proxy({} as BackendStore, {
  get(_target, property: keyof BackendStore) {
    const member = activeStore[property];
    return typeof member === "function" ? member.bind(activeStore) : member;
  },
});

let activeStore: BackendStore = demoMemoryStore;

/**
 * Installs the store the process runs on. Called once by `composition.ts`, the
 * only module that sees both `core` and `db`.
 *
 * Returns the store being replaced, so a caller that needs to put things back —
 * a test swapping in a fake — can do so without this module having to hand out
 * a reference to the memory store for that purpose alone.
 */
export function setActiveStore(store: BackendStore): BackendStore {
  const previous = activeStore;
  activeStore = store;
  return previous;
}

/** Which store is installed, for the diagnostics route and tests. */
export function isMemoryStoreActive(): boolean {
  return activeStore === demoMemoryStore;
}

/**
 * The former name for {@link backendStore}, kept because it is the default
 * parameter on every handler. It is no longer necessarily the demo store — the
 * composition root may have pointed it at PostgreSQL — which is why new code
 * should say `backendStore`.
 */
export const demoBackendStore: BackendStore = backendStore;

/**
 * Restores the in-memory fixtures. Tests only; it resets the memory store
 * itself rather than whatever is currently installed, so it is a no-op against
 * PostgreSQL by design — truncating a real database from a test helper is not a
 * behaviour worth having.
 */
export function resetDemoBackendStore(): void {
  demoMemoryStore.reset();
}

function sortedByCreatedAt(
  activities: readonly ActivityRecord[],
): readonly ActivityRecord[] {
  return [...activities].sort((left, right) =>
    left.createdAt === right.createdAt
      ? left.id.localeCompare(right.id)
      : left.createdAt.localeCompare(right.createdAt),
  );
}
