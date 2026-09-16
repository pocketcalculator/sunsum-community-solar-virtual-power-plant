// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Viewer } from "@/backend/core/identity";
import {
  advanceProjectStage,
  decideSubmission,
  getPipeline,
  updateProject,
  updateProjectVisibility,
} from "@/backend/core/projects";
import { MOCK_PROJECTS } from "@/backend/core/projects/mock-store";
import { failure } from "@/backend/core/shared";
import {
  createSite,
  getSubmissionDetail,
  listSubmissions,
  submitSite,
  updateDraftSite,
  type SiteCreateInput,
  type ViabilityClient,
} from "@/backend/core/sites";
import {
  createMemoryBackendStore,
  demoAssessmentId,
  demoFundingNeedId,
  DEMO_DOCUMENT_ID,
} from "@/backend/core/store";
import { expressInterest, listMyEngagements, listProjectEngagements, listProjectFundingNeeds } from "@/backend/core/engagements";
import { getDealRoom, getOwnerOutstanding, getOwnerSites, journeyStageId } from "@/backend/core/views";
import { addSiteDocument } from "@/backend/core/documents";
import { DEFAULT_PORTFOLIO_QUERY, getPortfolio, getMyInvestorProfile, upsertMyInvestorProfile } from "@/backend/core/investors";
import {
  handleGetPortfolio,
  handlePostEngagement,
  handlePatchProjectVisibility,
  handlePostSite,
  handlePostSubmissionDecision,
  resolveDemoInvestor,
  resolveDemoOperator,
  resolveDemoSiteOwner,
} from "@/backend/handlers";

const owner: Viewer = {
  role: "site_owner",
  userId: "cd865e91-942b-48d3-a6f1-7b2053e4c890",
};
const operator: Viewer = {
  role: "operator",
  userId: "188d99df-33ce-4cd5-9744-a17968679b50",
};
const investor: Viewer = {
  role: "investor",
  userId: "9727021a-7b77-418d-a802-faa4bc230032",
  investor: {
    id: "150bbd86-f79c-48db-8579-e7c79db8c468",
    organizationName: "Test Investor",
    fundingStageFocus: [],
    geographies: [],
    onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
  },
};
const pendingInvestor: Viewer = {
  ...investor,
  investor: { ...investor.investor, onboardingCompletedAt: null },
};

const completeSite: SiteCreateInput = {
  addressRaw: "1 Test Street, Atlanta, GA",
  siteType: "rooftop",
  ownershipStatus: "confirmed",
  approximateAreaSqm: 500,
  electricityUsageKwhAnnual: 12000,
  hasExistingSolar: false,
  consentGiven: true,
  submit: true,
};

const viability: ViabilityClient = {
  assess: () =>
    Promise.resolve({
      rulesetVersion: "test-v1",
      inputsUsed: { factor: "test" },
      estimatedSystemSizeKwLow: 100,
      estimatedSystemSizeKwHigh: 140,
      estimatedAnnualGenerationKwhLow: 130000,
      estimatedAnnualGenerationKwhHigh: 180000,
      preliminaryProjectType: "community_rooftop",
      viabilityStatus: "potentially_viable",
      flags: [],
      missingInformation: [],
    }),
};

async function submittedStore() {
  const store = createMemoryBackendStore();
  const created = await createSite(owner, completeSite, store, viability);
  if (!created.ok) throw new Error(created.failure.code);
  return { store, siteId: created.value.site.id };
}

async function acceptedStore() {
  const { store, siteId } = await submittedStore();
  const accepted = await decideSubmission(
    operator,
    siteId,
    {
      decision: "accept",
      note: "Approved for development",
      projectName: "Test Solar",
      assignedOperatorUserId: null,
    },
    store,
  );
  if (!accepted.ok || accepted.value.project === undefined) {
    throw new Error("accept failed");
  }
  return { store, siteId, projectId: accepted.value.project.id };
}

describe("site creation and owner views", () => {
  it("authorizes before reading data", async () => {
    const store = createMemoryBackendStore();
    let reads = 0;
    const original = store.listSites.bind(store);
    store.listSites = () => {
      reads += 1;
      return original();
    };
    const result = await getOwnerSites(operator, store);
    expect(result.ok).toBe(false);
    expect(reads).toBe(0);
  });

  it("saves partial drafts and reports missing fields", async () => {
    const store = createMemoryBackendStore();
    const result = await createSite(
      owner,
      { addressRaw: "1 Test Street", submit: false },
      store,
      viability,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.site.submission_status).toBe("draft");
    expect(result.value.site.site_type).toBeNull();
    expect(result.value.site.ownership_status).toBeNull();
    expect(result.value.missing_fields.map((item) => item.field)).toContain(
      "site_type",
    );
    const dashboard = await getOwnerSites(owner, store);
    expect(dashboard.ok).toBe(true);
    if (dashboard.ok) {
      expect(dashboard.value[0]).toMatchObject({
        submission_status: "draft",
        project_stage: null,
        journey_stage_id: null,
      });
      expect(dashboard.value[0]).not.toHaveProperty("stage");
    }
  });

  it("maps submission and project states to UI journey stages", () => {
    expect(journeyStageId("submitted", null)).toBe("submitted");
    expect(journeyStageId("screening", null)).toBe("screening");
    expect(journeyStageId("draft", null)).toBeNull();
    expect(journeyStageId("info_requested", null)).toBeNull();
    expect(journeyStageId("rejected", null)).toBeNull();
    expect(journeyStageId("accepted", null)).toBeNull();
    expect(journeyStageId("accepted", "pre_development")).toBe(
      "pre-development",
    );
    expect(journeyStageId("rejected", "operations")).toBe("operations");
  });

  it("does not persist anything when viability is unavailable", async () => {
    const store = createMemoryBackendStore();
    const result = await createSite(owner, completeSite, store, {
      assess: () => Promise.reject(new Error("offline")),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("service_unavailable");
    expect(await store.listSites()).toHaveLength(0);
  });

  it("rejects an incomplete direct submission without persisting it", async () => {
    const store = createMemoryBackendStore();
    const result = await createSite(
      owner,
      { addressRaw: "Incomplete", submit: true },
      store,
      viability,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("validation_failed");
      expect(result.failure.details?.missing_fields).toBeDefined();
    }
    expect(await store.listSites()).toHaveLength(0);
  });

  it("returns only the owner's composed sites with empty backing arrays", async () => {
    const store = createMemoryBackendStore();
    await createSite(owner, { addressRaw: "Mine", submit: false }, store, viability);
    await createSite(
      {
        role: "site_owner",
        userId: "f98dc14c-e7a8-45f1-9310-27b8f490169d",
      },
      { addressRaw: "Not mine", submit: false },
      store,
      viability,
    );
    const result = await getOwnerSites(owner, store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      documents: [],
      acknowledgements: [],
      outstanding: [],
    });
  });
});

describe("submission queue and decisions", () => {
  it("checks operator authorization before loading a submission", async () => {
    const store = createMemoryBackendStore();
    let reads = 0;
    store.getSite = () => {
      reads += 1;
      return Promise.resolve(null);
    };
    const result = await decideSubmission(
      owner,
      "unknown",
      {
        decision: "accept",
        note: null,
        projectName: null,
        assignedOperatorUserId: null,
      },
      store,
    );
    expect(result.ok).toBe(false);
    expect(reads).toBe(0);
  });

  it("excludes drafts and applies status, type, viability, and location filters", async () => {
    const { store } = await submittedStore();
    await createSite(owner, { addressRaw: "Draft", submit: false }, store, viability);
    const result = await listSubmissions(
      operator,
      {
        statuses: ["submitted"],
        siteType: "rooftop",
        viability: "potentially_viable",
        location: "atlanta",
      },
      store,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it("accepts atomically with midpoint, hidden default, and one activity", async () => {
    const { store, siteId } = await submittedStore();
    const result = await decideSubmission(
      operator,
      siteId,
      {
        decision: "accept",
        note: null,
        projectName: null,
        assignedOperatorUserId: null,
      },
      store,
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.project === undefined) return;
    expect(result.value.site.submission_status).toBe("accepted");
    expect(result.value.project).toMatchObject({
      stage: "pre_development",
      estimated_capacity_kw: 120,
      visible_to_investors: false,
    });

    expect(await store.listActivity(result.value.project.id)).toHaveLength(1);
    const repeat = await decideSubmission(
      operator,
      siteId,
      {
        decision: "accept",
        note: null,
        projectName: null,
        assignedOperatorUserId: null,
      },
      store,
    );
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.failure.code).toBe("conflict");
  });

  it("rolls back acceptance if any atomic write fails", async () => {
    const { store, siteId } = await submittedStore();
    const originalTransaction = store.transaction.bind(store);
    store.transaction = (operation) =>
      originalTransaction(async (transaction) => {
        await operation(transaction);
        throw new Error("write failed");
      });
    await expect(
      decideSubmission(
        operator,
        siteId,
        {
          decision: "accept",
          note: null,
          projectName: null,
          assignedOperatorUserId: null,
        },
        store,
      ),
    ).rejects.toThrow("write failed");
    expect((await store.getSite(siteId))?.submissionStatus).toBe("submitted");
    expect(await store.getProjectBySite(siteId)).toBeNull();
  });

  it("serializes concurrent accepts so only one project is created", async () => {
    const { store, siteId } = await submittedStore();
    const input = {
      decision: "accept" as const,
      note: null,
      projectName: "Test Solar",
      assignedOperatorUserId: null,
    };

    const results = await Promise.all([
      decideSubmission(operator, siteId, input, store),
      decideSubmission(operator, siteId, input, store),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.ok && result.failure.code === "conflict",
      ),
    ).toHaveLength(1);
    expect(await store.listProjects()).toHaveLength(1);
  });

  it.each([
    "1 Test",
    "Test Street",
    "Atlanta Solar",
    "GA Solar",
    "1 Test Street Solar",
  ])("does not expose the partial address label %s", async (projectName) => {
    const { store, siteId } = await submittedStore();
    const result = await decideSubmission(
      operator,
      siteId,
      {
        decision: "accept",
        note: null,
        projectName,
        assignedOperatorUserId: null,
      },
      store,
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.project === undefined) return;
    expect(result.value.project.name).toBe("Community solar project");
  });

  it.each([
    ["reject", "rejected"],
    ["request_info", "info_requested"],
  ] as const)("handles %s and logs it", async (decision, status) => {
    const { store, siteId } = await submittedStore();
    const result = await decideSubmission(
      operator,
      siteId,
      {
        decision,
        note: "Operator note",
        projectName: null,
        assignedOperatorUserId: null,
      },
      store,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.site.submission_status).toBe(status);
    expect(await store.listSiteActivity(siteId)).toHaveLength(1);
  });

  it("requires a note for reject and request_info", async () => {
    const { store, siteId } = await submittedStore();
    const result = await decideSubmission(
      operator,
      siteId,
      {
        decision: "reject",
        note: null,
        projectName: null,
        assignedOperatorUserId: null,
      },
      store,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("validation_failed");
  });
});

describe("project workflow", () => {
  it("allows nested transactions without deadlocking", async () => {
    const { store, projectId } = await acceptedStore();

    await store.transaction((transaction) =>
      transaction.transaction(async (nested) => {
        const project = await nested.getProject(projectId);
        if (project === null) throw new Error("missing project");
        await nested.updateProject({
          ...project,
          visibleToInvestors: true,
        });
      }),
    );

    expect((await store.getProject(projectId))?.visibleToInvestors).toBe(true);
  });

  it("isolates working state and does not roll back a later transaction", async () => {
    const { store, projectId } = await acceptedStore();
    let releaseFailure = (): void => undefined;
    let markEntered = (): void => undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const blocker = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });

    const failing = store.transaction(async (transaction) => {
      const project = await transaction.getProject(projectId);
      if (project === null) throw new Error("missing project");
      await transaction.updateProject({ ...project, stage: "development" });
      markEntered();
      await blocker;
      throw new Error("rollback");
    });
    await entered;

    expect((await store.getProject(projectId))?.stage).toBe("pre_development");
    const succeeding = store.transaction(async (transaction) => {
      const project = await transaction.getProject(projectId);
      if (project === null) throw new Error("missing project");
      await transaction.updateProject({
        ...project,
        visibleToInvestors: true,
      });
    });

    releaseFailure();
    await expect(failing).rejects.toThrow("rollback");
    await succeeding;

    expect(await store.getProject(projectId)).toMatchObject({
      stage: "pre_development",
      visibleToInvestors: true,
    });
  });

  it("rolls back writes when a transaction callback returns a failed Result", async () => {
    const { store, projectId } = await acceptedStore();

    const result = await store.transaction(async (transaction) => {
      const project = await transaction.getProject(projectId);
      if (project === null) throw new Error("missing project");
      await transaction.updateProject({ ...project, stage: "development" });
      await transaction.addActivity({
        id: transaction.nextId("activity"),
        siteId: project.siteId,
        projectId,
        actorUserId: operator.userId,
        action: "should_be_rolled_back",
        note: "not committed",
        fromValue: project.stage,
        toValue: "development",
        createdAt: new Date().toISOString(),
      });
      return failure("conflict", "Abort this transaction.");
    });

    expect(result.ok).toBe(false);
    expect((await store.getProject(projectId))?.stage).toBe("pre_development");
    expect(
      (await store.listActivity(projectId)).some(
        (item) => item.action === "should_be_rolled_back",
      ),
    ).toBe(false);
  });

  it("allows only adjacent forward stages and logs exactly once", async () => {
    const { store, projectId } = await acceptedStore();
    const advanced = await advanceProjectStage(
      operator,
      projectId,
      "development",
      store,
    );
    expect(advanced.ok).toBe(true);
    expect(await store.listActivity(projectId)).toHaveLength(2);
    const skipped = await advanceProjectStage(
      operator,
      projectId,
      "commissioning",
      store,
    );
    expect(skipped.ok).toBe(false);
    if (!skipped.ok) {
      expect(skipped.failure).toMatchObject({
        code: "conflict",
        details: { allowed: ["construction"] },
      });

    }
    expect(await store.listActivity(projectId)).toHaveLength(2);
  });

  it("rejects backward and terminal transitions", async () => {
    const { store, projectId } = await acceptedStore();
    for (const stage of [
      "development",
      "construction",
      "commissioning",
      "operations",
    ] as const) {
      expect((await advanceProjectStage(operator, projectId, stage, store)).ok).toBe(
        true,
      );
    }
    const terminal = await advanceProjectStage(
      operator,
      projectId,
      "operations",
      store,
    );
    expect(terminal.ok).toBe(false);
    if (!terminal.ok) {
      expect(terminal.failure).toMatchObject({
        code: "conflict",
        details: { allowed: [] },
      });
    }
    const backward = await advanceProjectStage(
      operator,
      projectId,
      "development",
      store,
    );
    expect(backward.ok).toBe(false);
  });

  it("updates visibility and writes one activity", async () => {
    const { store, projectId } = await acceptedStore();
    const result = await updateProjectVisibility(operator, projectId, true, store);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.visible_to_investors).toBe(true);
    expect(await store.listActivity(projectId)).toHaveLength(2);
  });

  it("preserves concurrent stage and visibility updates", async () => {
    const { store, projectId } = await acceptedStore();

    const [stageResult, visibilityResult] = await Promise.all([
      advanceProjectStage(operator, projectId, "development", store),
      updateProjectVisibility(operator, projectId, true, store),
    ]);

    expect(stageResult.ok).toBe(true);
    expect(visibilityResult.ok).toBe(true);
    expect(await store.getProject(projectId)).toMatchObject({
      stage: "development",
      visibleToInvestors: true,
    });
  });

  it("revalidates concurrent stage changes inside the transaction", async () => {
    const { store, projectId } = await acceptedStore();

    const results = await Promise.all([
      advanceProjectStage(operator, projectId, "development", store),
      advanceProjectStage(operator, projectId, "development", store),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.ok && result.failure.code === "conflict",
      ),
    ).toHaveLength(1);
    expect((await store.getProject(projectId))?.stage).toBe("development");
  });
});

describe("demo funding needs", () => {
  it("uses stable UUID principals consistently across seeded references", async () => {
    const store = createMemoryBackendStore({ seedDemoProjects: true });
    const demoOwner = resolveDemoSiteOwner();
    const demoOperator = resolveDemoOperator();
    const demoInvestor = await resolveDemoInvestor(store);
    if (demoInvestor.role !== "investor") throw new Error("expected investor");
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(demoOwner.userId).toMatch(uuid);
    expect(demoOperator.userId).toMatch(uuid);
    expect(demoInvestor.userId).toMatch(uuid);
    expect(demoInvestor.investor.id).toMatch(uuid);
    expect(demoInvestor.investor.id).not.toBe(demoInvestor.userId);

    const projects = await store.listProjects();
    expect(projects).not.toHaveLength(0);
    for (const project of projects) {
      expect(project.ownerUserId).toBe(demoOwner.userId);
      expect(project.assignedOperatorUserId).toBe(demoOperator.userId);
    }

    await expect(store.getUser(demoOwner.userId)).resolves.toMatchObject({
      role: "site_owner",
    });
    await expect(store.getUser(demoOperator.userId)).resolves.toMatchObject({
      role: "operator",
    });
    await expect(store.getUser(demoInvestor.userId)).resolves.toMatchObject({
      role: "investor",
    });
  });

  it("seeds one amountless row per advertised open funding need", async () => {
    const store = createMemoryBackendStore({ seedDemoProjects: true });
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    for (const [projectIndex, project] of MOCK_PROJECTS.entries()) {
      expect(project.id).toMatch(uuid);
      expect(project.siteId).toMatch(uuid);
      expect(demoAssessmentId(projectIndex)).toMatch(uuid);
      await expect(store.listAssessments(project.siteId)).resolves.toEqual([
        expect.objectContaining({ id: demoAssessmentId(projectIndex) }),
      ]);

      for (let needIndex = 0; needIndex < project.openFundingNeedsCount; needIndex += 1) {
        const fundingNeedId = demoFundingNeedId(projectIndex, needIndex);
        expect(fundingNeedId).toMatch(uuid);
        expect(await store.getFundingNeed(fundingNeedId)).toMatchObject({
          projectId: project.id,
          amountRequested: null,
          amountCommitted: null,
          status: "open",
        });
      }
    }

    expect(DEMO_DOCUMENT_ID).toMatch(uuid);
    const firstProject = MOCK_PROJECTS[0]!;
    await expect(
      store.listDocuments(firstProject.siteId, firstProject.id),
    ).resolves.toEqual([
      expect.objectContaining({ id: DEMO_DOCUMENT_ID }),
    ]);
  });

  it("accepts a seeded funding need UUID when creating an engagement", async () => {
    const store = createMemoryBackendStore({ seedDemoProjects: true });
    const project = MOCK_PROJECTS[0]!;
    const fundingNeedId = demoFundingNeedId(0, 0);

    const response = await handlePostEngagement(
      new Request(`https://sunsum.test/api/projects/${project.id}/engagements`, {
        method: "POST",
        body: JSON.stringify({ funding_need_id: fundingNeedId }),
      }),
      await resolveDemoInvestor(),
      project.id,
      store,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      project_id: project.id,
      funding_need_id: fundingNeedId,
      state: "interested",
    });
  });
});

describe("complete demo storyline", () => {
  it("submits, accepts, publishes, and mandate-matches without exposing the address", async () => {
    const store = createMemoryBackendStore();
    const address = "742 Evergreen Terrace, Atlanta, GA 30303";
    const siteResponse = await handlePostSite(
      new Request("https://sunsum.test/api/sites", {
        method: "POST",
        body: JSON.stringify({
          address_raw: address,
          site_type: "rooftop",
          ownership_status: "confirmed",
          approximate_area_sqm: 500,
          electricity_usage_kwh_annual: 12000,
          has_existing_solar: false,
          consent_given: true,
          submit: true,
        }),
      }),
      owner,
      store,
      viability,
    );
    expect(siteResponse.status).toBe(201);
    const siteBody = (await siteResponse.json()) as {
      site: { id: string };
    };

    const decisionResponse = await handlePostSubmissionDecision(
      new Request(
        `https://sunsum.test/api/submissions/${siteBody.site.id}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            decision: "accept",
            project_name: address,
          }),
        },
      ),
      operator,
      siteBody.site.id,
      store,
    );
    expect(decisionResponse.status).toBe(200);
    const decisionBody = (await decisionResponse.json()) as {
      project: { id: string };
    };

    const visibilityResponse = await handlePatchProjectVisibility(
      new Request(
        `https://sunsum.test/api/projects/${decisionBody.project.id}/visibility`,
        {
          method: "PATCH",
          body: JSON.stringify({ visible_to_investors: true }),
        },
      ),
      operator,
      decisionBody.project.id,
      store,
    );
    expect(visibilityResponse.status).toBe(200);

    const geographicallyFocusedInvestor: Viewer = {
      ...investor,
      investor: { ...investor.investor, geographies: ["GA"] },
    };
    const portfolioResponse = await handleGetPortfolio(
      new Request("https://sunsum.test/api/portfolio"),
      geographicallyFocusedInvestor,
      store,
    );
    expect(portfolioResponse.status).toBe(200);
    const portfolioJson = await portfolioResponse.text();
    const portfolio = JSON.parse(portfolioJson) as {
      items: Array<{
        project_id: string;
        name: string;
        locality: string;
        open_funding_needs_count: number;
      }>;
    };

    expect(portfolio.items).toEqual([
      expect.objectContaining({
        project_id: decisionBody.project.id,
        name: "Community solar project",
        locality: "Location withheld",
        open_funding_needs_count: 1,
      }),
    ]);
    expect(portfolioJson).not.toContain(address);
  });
});

describe("engagements and deal room", () => {
  it("checks investor authorization before loading a project", async () => {
    const store = createMemoryBackendStore();
    let reads = 0;
    store.getProject = () => {
      reads += 1;
      return Promise.resolve(null);
    };
    const result = await expressInterest(operator, "unknown", null, store);
    expect(result.ok).toBe(false);
    expect(reads).toBe(0);
  });

  it("requires onboarding and visibility and rejects a duplicate live interest", async () => {
    const { store, projectId } = await acceptedStore();
    expect((await expressInterest(pendingInvestor, projectId, null, store)).ok).toBe(
      false,
    );
    const hidden = await expressInterest(investor, projectId, null, store);
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.failure.code).toBe("not_found");
    await updateProjectVisibility(operator, projectId, true, store);
    expect((await expressInterest(investor, projectId, null, store)).ok).toBe(true);
    const duplicate = await expressInterest(investor, projectId, null, store);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.failure.code).toBe("conflict");
  });

  it("serializes concurrent interest so only one live engagement is created", async () => {
    const { store, projectId } = await acceptedStore();
    await updateProjectVisibility(operator, projectId, true, store);

    const results = await Promise.all([
      expressInterest(investor, projectId, null, store),
      expressInterest(investor, projectId, null, store),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.ok && result.failure.code === "conflict",
      ),
    ).toHaveLength(1);
    expect(await store.listEngagements(projectId)).toHaveLength(1);
  });

  it("aborts if project visibility is revoked inside the transaction", async () => {
    const { store, projectId } = await acceptedStore();
    await updateProjectVisibility(operator, projectId, true, store);
    const originalTransaction = store.transaction.bind(store);
    store.transaction = async (operation) => {
      const project = await store.getProject(projectId);
      if (project === null) throw new Error("missing project");
      await store.updateProject({ ...project, visibleToInvestors: false });
      return originalTransaction(operation);
    };

    const result = await expressInterest(investor, projectId, null, store);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("not_found");
    expect(await store.listEngagements(projectId)).toHaveLength(0);
    expect(
      (await store.listActivity(projectId)).filter(
        (item) => item.action === "investor_interest_expressed",
      ),
    ).toHaveLength(0);
  });

  it("allows operators to list engagements without internal commitment fields", async () => {
    const { store, projectId } = await acceptedStore();
    await updateProjectVisibility(operator, projectId, true, store);
    await expressInterest(investor, projectId, null, store);
    const result = await listProjectEngagements(operator, projectId, store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(JSON.stringify(result.value)).not.toContain("commitmentInstrument");
  });

  it("unlocks tier 1 only for a current live engagement and hides sensitive fields", async () => {
    const { store, siteId, projectId } = await acceptedStore();
    const project = await store.getProject(projectId);
    if (project === null) throw new Error("missing project");
    await store.updateProject({ ...project, locality: "Atlanta metro" });
    const assessment = (await store.listAssessments(siteId)).at(-1);
    if (assessment === undefined) throw new Error("missing assessment");
    await store.addAssessment({
      ...assessment,
      id: "a5500000-0000-4000-8000-000000000101",
      inputsUsed: {
        address_raw: completeSite.addressRaw,
        latitude: 33.75,
        longitude: -84.39,
      },
      isOverride: true,
      overrideReason: "Internal operator override note",
      overriddenByUserId: operator.userId,
    });
    await updateProjectVisibility(operator, projectId, true, store);
    const locked = await getDealRoom(investor, projectId, store);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.failure.code).toBe("forbidden_tier");
    await expressInterest(investor, projectId, null, store);
    const unlocked = await getDealRoom(investor, projectId, store);
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) return;
    const serialized = JSON.stringify(unlocked.value);
    expect(serialized).toContain("assessment_history");
    expect(serialized).toContain("timeline");
    expect(serialized).toContain("Atlanta metro");
    expect(serialized).not.toContain(completeSite.addressRaw);
    expect(serialized).not.toContain("address_raw");
    expect(serialized).not.toContain("latitude");
    expect(serialized).not.toContain("longitude");
    expect(serialized).not.toContain("Internal operator override note");
    expect(serialized).not.toContain("overridden_by_user_id");
    expect(serialized).not.toContain("owner_user_id");
    expect(serialized).not.toContain("blobPath");
    expect(serialized).not.toContain("blob_path");

    const latestProject = await store.getProject(projectId);
    if (latestProject === null) throw new Error("missing project");
    await store.updateProject({ ...latestProject, locality: " " });
    const withheld = await getDealRoom(investor, projectId, store);
    expect(withheld.ok).toBe(true);
    if (withheld.ok) {
      expect(withheld.value.site).toMatchObject({
        locality: "Location withheld",
      });
    }
  });

  it("filters deal-room activity to shared status and the current investor", async () => {
    const { store, siteId, projectId } = await acceptedStore();
    await updateProjectVisibility(operator, projectId, true, store);
    await expressInterest(investor, projectId, null, store);
    const createdAt = new Date().toISOString();
    await store.addActivity({
      id: "ac710000-0000-4000-8000-000000000101",
      siteId,
      projectId,
      actorUserId: "603c16d2-a6e6-487e-95de-8dd4f8a47cd4",
      action: "investor_interest_expressed",
      note: "Other investor private note",
      fromValue: null,
      toValue: "interested",
      createdAt,
    });
    await store.addActivity({
      id: "ac710000-0000-4000-8000-000000000102",
      siteId,
      projectId,
      actorUserId: operator.userId,
      action: "operator_internal_decision",
      note: "Confidential operator reasoning",
      fromValue: null,
      toValue: null,
      createdAt,
    });
    await store.addActivity({
      id: "ac710000-0000-4000-8000-000000000103",
      siteId,
      projectId,
      actorUserId: operator.userId,
      action: "project_stage_changed",
      note: "Internal stage rationale",
      fromValue: "pre_development",
      toValue: "development",
      createdAt,
    });

    const result = await getDealRoom(investor, projectId, store);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.value);
    expect(serialized).toContain("investor_interest_expressed");
    expect(serialized).toContain("ac710000-0000-4000-8000-000000000103");
    expect(serialized).not.toContain("ac710000-0000-4000-8000-000000000101");
    expect(serialized).not.toContain("ac710000-0000-4000-8000-000000000102");
    expect(serialized).not.toContain("Other investor private note");
    expect(serialized).not.toContain("Confidential operator reasoning");
    expect(serialized).not.toContain("Internal stage rationale");
    expect(serialized).not.toContain("note");
  });

  it("returns only documents explicitly classified for tier 1", async () => {
    const { store, siteId, projectId } = await acceptedStore();
    const createdAt = new Date().toISOString();
    await store.addDocument({
      id: "d5500000-0000-4000-8000-000000000101",
      siteId,
      projectId,
      blobPath: "private/owners/electricity-bill.pdf",
      originalFilename: "electricity-bill.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      docType: "electricity_bill",
      disclosureClass: "owner_private",
      uploadedByUserId: owner.userId,
      createdAt,
    });
    await store.addDocument({
      id: "d5500000-0000-4000-8000-000000000102",
      siteId,
      projectId,
      blobPath: "private/projects/investor-summary.pdf",
      originalFilename: "investor-summary.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      docType: "site_summary",
      disclosureClass: "investor_tier_1",
      uploadedByUserId: operator.userId,
      createdAt,
    });
    await updateProjectVisibility(operator, projectId, true, store);
    await expressInterest(investor, projectId, null, store);

    const result = await getDealRoom(investor, projectId, store);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.value);
    expect(serialized).toContain("investor-summary.pdf");
    expect(serialized).not.toContain("electricity-bill.pdf");
    expect(serialized).not.toContain("private/owners");
    expect(serialized).not.toContain("private/projects");
  });

  it("returns 404 for invisible projects and revokes tier 1 after decline", async () => {
    const { store, projectId } = await acceptedStore();
    const hidden = await getDealRoom(investor, projectId, store);
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.failure.code).toBe("not_found");

    await updateProjectVisibility(operator, projectId, true, store);
    await expressInterest(investor, projectId, null, store);
    const now = new Date().toISOString();
    await store.addEngagement({
      id: store.nextId("engagement"),
      investorId: investor.investor.id,
      investorUserId: investor.userId,
      projectId,
      fundingNeedId: null,
      state: "declined",
      stateChangedAt: now,
      committedAmount: null,
      commitmentInstrument: null,
      isBinding: false,
      declineReason: "Passed",
      createdAt: now,
    });
    const declined = await getDealRoom(investor, projectId, store);
    expect(declined.ok).toBe(false);
    if (!declined.ok) expect(declined.failure.code).toBe("forbidden_tier");
  });
});


describe("new endpoint workflows", () => {
  it("updates only draft sites, refreshes missing fields, and enforces ownership", async () => {
    const store = createMemoryBackendStore();
    const draft = await createSite(owner, { addressRaw: "Old", submit: false }, store, viability);
    if (!draft.ok) throw new Error(draft.failure.code);
    const updated = await updateDraftSite(owner, draft.value.site.id, { siteType: "land" }, store);
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.site).toMatchObject({ address_raw: "Old", site_type: "land" });
    expect(updated.value.missing_fields.map((item) => item.field)).toContain("ownership_status");

    const otherOwner: Viewer = { role: "site_owner", userId: "f98dc14c-e7a8-45f1-9310-27b8f490169d" };
    const denied = await updateDraftSite(otherOwner, draft.value.site.id, { siteType: "rooftop" }, store);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.failure.code).toBe("forbidden_owner");

    const submitted = await submitSite(owner, draft.value.site.id, store, viability);
    expect(submitted.ok).toBe(false);
    const completeDraft = await createSite(owner, { ...completeSite, submit: false }, store, viability);
    if (!completeDraft.ok) throw new Error(completeDraft.failure.code);
    await submitSite(owner, completeDraft.value.site.id, store, viability);
    const conflict = await updateDraftSite(owner, completeDraft.value.site.id, { siteType: "land" }, store);
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.failure.code).toBe("conflict");
  });

  it("submits drafts and resubmits info requests with assessment and activity", async () => {
    const store = createMemoryBackendStore();
    const draft = await createSite(owner, { ...completeSite, submit: false }, store, viability);
    if (!draft.ok) throw new Error(draft.failure.code);
    expect((await submitSite(operator, draft.value.site.id, store, viability)).ok).toBe(false);
    const submitted = await submitSite(owner, draft.value.site.id, store, viability);
    expect(submitted.ok).toBe(true);
    if (submitted.ok) expect(submitted.value.assessment?.viability_status).toBe("potentially_viable");

    const { store: infoStore, siteId } = await submittedStore();
    await decideSubmission(operator, siteId, { decision: "request_info", note: "Need bill", projectName: null, assignedOperatorUserId: null }, infoStore);
    const resubmitted = await submitSite(owner, siteId, infoStore, viability);
    expect(resubmitted.ok).toBe(true);
    expect((await infoStore.listSiteActivity(siteId)).map((item) => item.action)).toContain("site_resubmitted");
  });

  it("records document metadata without exposing blob paths and validates inputs", async () => {
    const { store, siteId } = await submittedStore();
    const added = await addSiteDocument(owner, siteId, {
      originalFilename: "bill.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      docType: "electricity_bill",
      disclosureClass: "owner_private",
    }, store);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(JSON.stringify(added.value)).not.toContain("blob");
    expect(added.value.disclosure_class).toBe("owner_private");
    const otherOwner: Viewer = { role: "site_owner", userId: "f98dc14c-e7a8-45f1-9310-27b8f490169d" };
    const denied = await addSiteDocument(otherOwner, siteId, {
      originalFilename: "other.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
      docType: null,
      disclosureClass: "owner_private",
    }, store);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.failure.code).toBe("forbidden_owner");
  });

  it("refuses to let a site owner disclose their own document to investors", async () => {
    const { store, siteId } = await submittedStore();
    const leaked = await addSiteDocument(owner, siteId, {
      originalFilename: "electricity-bill.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      docType: "electricity_bill",
      disclosureClass: "investor_tier_1",
    }, store);
    expect(leaked.ok).toBe(false);
    if (!leaked.ok) expect(leaked.failure.code).toBe("forbidden_role");
    expect(await store.listDocuments(siteId, null)).toHaveLength(0);

    const disclosed = await addSiteDocument(operator, siteId, {
      originalFilename: "teaser.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      docType: "site_summary",
      disclosureClass: "investor_tier_1",
    }, store);
    expect(disclosed.ok).toBe(true);
    if (disclosed.ok) expect(disclosed.value.disclosure_class).toBe("investor_tier_1");
  });

  it("returns operator submission detail with history documents owner and activity", async () => {
    const { store, siteId } = await submittedStore();
    await addSiteDocument(owner, siteId, { originalFilename: "bill.pdf", contentType: "application/pdf", sizeBytes: 1, docType: null, disclosureClass: "owner_private" }, store);
    const detail = await getSubmissionDetail(operator, siteId, store);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.value.site.id).toBe(siteId);
    expect(detail.value.assessment_history).toHaveLength(1);
    expect(detail.value.documents).toHaveLength(1);
    expect(detail.value.owner).toBeNull();
    expect(await getSubmissionDetail(owner, siteId, store)).toMatchObject({ ok: false });
  });

  it("updates project assignment and next action but not restricted fields", async () => {
    const { store, projectId } = await acceptedStore();
    const demoOp = resolveDemoOperator();
    const updated = await updateProject(operator, projectId, {
      assignedOperatorUserId: demoOp.userId,
      nextAction: "Schedule visit",
      targetDate: "2026-10-01",
    }, store);
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value).toMatchObject({ assigned_operator_user_id: demoOp.userId, next_action: "Schedule visit", target_date: "2026-10-01" });
    expect((await store.listActivity(projectId)).map((item) => item.action)).toEqual(expect.arrayContaining(["project_assignee_changed", "project_next_action_changed", "project_target_date_changed"]));
    const denied = await updateProject(owner, projectId, { nextAction: "Nope" }, store);
    expect(denied.ok).toBe(false);
    const invalid = await updateProject(operator, projectId, { assignedOperatorUserId: owner.userId }, store);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.failure.code).toBe("validation_failed");
  });

  it("returns all seven pipeline columns in order and places site/project cards correctly", async () => {
    const { store, siteId } = await submittedStore();
    const { projectId } = await acceptedStoreWithStore(store);
    const board = await getPipeline(operator, { statuses: [], siteType: null, viability: null, location: null }, store);
    expect(board.ok).toBe(true);
    if (!board.ok) return;
    expect(board.value.columns.map((column) => column.journey_stage_id)).toEqual(["submitted", "screening", "pre-development", "development", "construction", "commissioning", "operations"]);
    expect(board.value.columns[0]?.items.map((item) => item.site_id)).toContain(siteId);
    expect(board.value.columns[2]?.items.map((item) => item.project_id)).toContain(projectId);
    expect((await getPipeline(owner, { statuses: [], siteType: null, viability: null, location: null }, store)).ok).toBe(false);
  });

  it("persists investor profiles and unlocks mandate-matched portfolio", async () => {
    const store = createMemoryBackendStore({ seedDemoProjects: true });
    const pending: Viewer = { ...investor, investor: { ...investor.investor, onboardingCompletedAt: null, fundingStageFocus: ["permanent"], geographies: ["TN"] } };
    expect((await getPortfolio(pending, DEFAULT_PORTFOLIO_QUERY, store)).ok).toBe(false);
    const saved = await upsertMyInvestorProfile(pending, {
      organizationName: "New Fund",
      investorType: "impact_investor",
      capitalType: "concessionary_debt",
      fundingStageFocus: ["permanent"],
      ticketSizeMin: null,
      ticketSizeMax: null,
      geographies: ["TN"],
      investmentObjectives: [],
      impactPriorities: [],
      decisionCriteria: [],
    }, store);
    expect(saved.ok).toBe(true);
    const profile = await getMyInvestorProfile(pending, store);
    expect(profile.ok).toBe(true);
    if (!profile.ok) return;
    const onboarded: Viewer = { ...pending, investor: { ...pending.investor, onboardingCompletedAt: profile.value.onboarding_completed_at, fundingStageFocus: profile.value.funding_stage_focus, geographies: profile.value.geographies } };
    const portfolio = await getPortfolio(onboarded, DEFAULT_PORTFOLIO_QUERY, store);
    expect(portfolio.ok).toBe(true);
    if (portfolio.ok) expect(portfolio.value.items.map((item) => item.stage)).toEqual(["operations"]);
    expect((await upsertMyInvestorProfile(owner, saved.ok ? {
      organizationName: "Bad", investorType: "impact_investor", capitalType: "grant", fundingStageFocus: [], ticketSizeMin: null, ticketSizeMax: null, geographies: [], investmentObjectives: [], impactPriorities: [], decisionCriteria: []
    } : {} as never, store)).ok).toBe(false);
  });

  it("returns open funding needs for visible projects and current investor engagements only", async () => {
    const { store, projectId } = await acceptedStore();
    let needs = await listProjectFundingNeeds(investor, projectId, store);
    expect(needs.ok).toBe(false);
    await updateProjectVisibility(operator, projectId, true, store);
    needs = await listProjectFundingNeeds(investor, projectId, store);
    expect(needs.ok).toBe(true);
    if (needs.ok) expect(needs.value[0]?.project_id).toBe(projectId);
    expect((await listProjectFundingNeeds(owner, projectId, store)).ok).toBe(false);

    await expressInterest(investor, projectId, null, store);
    await store.addEngagement({ id: store.nextId("engagement"), investorId: "other", investorUserId: "other-user", projectId, fundingNeedId: null, state: "interested", stateChangedAt: new Date().toISOString(), committedAmount: null, commitmentInstrument: null, isBinding: false, declineReason: null, createdAt: new Date().toISOString() });
    const mine = await listMyEngagements(investor, store);
    expect(mine.ok).toBe(true);
    if (mine.ok) expect(mine.value).toHaveLength(1);
    expect((await listMyEngagements(operator, store)).ok).toBe(false);
  });

  it("stops listing an engagement once the operator revokes investor visibility", async () => {
    const { store, projectId } = await acceptedStore();
    await updateProjectVisibility(operator, projectId, true, store);
    await expressInterest(investor, projectId, null, store);

    const before = await listMyEngagements(investor, store);
    expect(before.ok).toBe(true);
    if (before.ok) expect(before.value).toHaveLength(1);

    await updateProjectVisibility(operator, projectId, false, store);

    const after = await listMyEngagements(investor, store);
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toEqual([]);
  });

  it("returns only the owner's outstanding request-info items", async () => {
    const { store, siteId } = await submittedStore();
    await decideSubmission(operator, siteId, { decision: "request_info", note: "Need bill", projectName: null, assignedOperatorUserId: null }, store);
    const inbox = await getOwnerOutstanding(owner, store);
    expect(inbox.ok).toBe(true);
    if (inbox.ok) expect(inbox.value).toEqual([expect.objectContaining({ site_id: siteId, message: "Need bill" })]);
    expect((await getOwnerOutstanding(operator, store)).ok).toBe(false);
  });
});

async function acceptedStoreWithStore(store: ReturnType<typeof createMemoryBackendStore>) {
  const created = await createSite(owner, { ...completeSite, addressRaw: "2 Accepted Street", submit: true }, store, viability);
  if (!created.ok) throw new Error(created.failure.code);
  const accepted = await decideSubmission(operator, created.value.site.id, { decision: "accept", note: null, projectName: "Accepted Solar", assignedOperatorUserId: null }, store);
  if (!accepted.ok || accepted.value.project === undefined) throw new Error("accept failed");
  return { siteId: created.value.site.id, projectId: accepted.value.project.id };
}
