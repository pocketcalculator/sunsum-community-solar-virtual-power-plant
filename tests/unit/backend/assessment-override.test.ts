// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Viewer } from "@/backend/core/identity";
import { decideSubmission, overrideAssessment } from "@/backend/core/projects";
import {
  createSite,
  type SiteCreateInput,
  type ViabilityClient,
} from "@/backend/core/sites";
import { createMemoryBackendStore } from "@/backend/core/store";
import { handlePostAssessmentOverride } from "@/backend/handlers";

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

/**
 * Returns `not_currently_eligible` so the override has something real to
 * disagree with. An override that only ever confirms the machine is not an
 * override.
 */
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
      viabilityStatus: "not_currently_eligible",
      flags: ["area_below_threshold"],
      missingInformation: [],
    }),
};

async function submittedStore() {
  const store = createMemoryBackendStore();
  const created = await createSite(owner, completeSite, store, viability);
  if (!created.ok) throw new Error(created.failure.code);
  return { store, siteId: created.value.site.id };
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/sites/x/assessment/override", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("overriding a preliminary viability result", () => {
  it("appends a new assessment and leaves the original readable", async () => {
    const { store, siteId } = await submittedStore();
    const before = await store.listAssessments(siteId);
    expect(before).toHaveLength(1);

    const result = await overrideAssessment(
      operator,
      siteId,
      {
        viabilityStatus: "potentially_viable",
        reason: "Owner supplied a survey showing usable area was understated.",
      },
      store,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = await store.listAssessments(siteId);
    expect(after).toHaveLength(2);

    /**
     * The screening the operator disagreed with is still there, unchanged and
     * still marked as the machine's. `assessments` is append-only, and an audit
     * trail that can be rewritten is not one.
     */
    expect(after[0]).toStrictEqual(before[0]);
    expect(after[0]?.viabilityStatus).toBe("not_currently_eligible");
    expect(after[0]?.isOverride).toBe(false);

    expect(after[1]?.viabilityStatus).toBe("potentially_viable");
    expect(after[1]?.isOverride).toBe(true);
    expect(after[1]?.overriddenByUserId).toBe(operator.userId);
    expect(after[1]?.overrideReason).toBe(
      "Owner supplied a survey showing usable area was understated.",
    );
    expect(after[1]?.id).not.toBe(before[0]?.id);
  });

  it("carries the estimates forward rather than letting an operator restate them", async () => {
    const { store, siteId } = await submittedStore();
    const [original] = await store.listAssessments(siteId);

    await overrideAssessment(
      operator,
      siteId,
      { viabilityStatus: "more_information_required", reason: "Pending utility confirmation." },
      store,
    );

    const [, override] = await store.listAssessments(siteId);
    expect(override?.estimatedSystemSizeKwLow).toBe(original?.estimatedSystemSizeKwLow);
    expect(override?.estimatedSystemSizeKwHigh).toBe(original?.estimatedSystemSizeKwHigh);
    expect(override?.estimatedAnnualGenerationKwhLow).toBe(
      original?.estimatedAnnualGenerationKwhLow,
    );
    expect(override?.rulesetVersion).toBe(original?.rulesetVersion);
    expect(override?.flags).toStrictEqual(original?.flags);
  });

  it("records who changed what, so the decision is attributable", async () => {
    const { store, siteId } = await submittedStore();

    await overrideAssessment(
      operator,
      siteId,
      { viabilityStatus: "potentially_viable", reason: "Site visit cleared the shading concern." },
      store,
    );

    const activity = await store.listSiteActivity(siteId);
    const entry = activity.find((item) => item.action === "assessment_overridden");
    expect(entry).toBeDefined();
    expect(entry?.actorUserId).toBe(operator.userId);
    expect(entry?.fromValue).toBe("not_currently_eligible");
    expect(entry?.toValue).toBe("potentially_viable");
    expect(entry?.note).toBe("Site visit cleared the shading concern.");
  });

  it("refuses every role that is not an operator", async () => {
    for (const viewer of [owner, investor]) {
      const { store, siteId } = await submittedStore();
      const result = await overrideAssessment(
        viewer,
        siteId,
        { viabilityStatus: "potentially_viable", reason: "Looks fine to me." },
        store,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.code).toBe("forbidden_role");
      expect(await store.listAssessments(siteId)).toHaveLength(1);
    }
  });

  it("requires a reason, including one that is only whitespace", async () => {
    for (const reason of ["", "   ", "\n\t"]) {
      const { store, siteId } = await submittedStore();
      const result = await overrideAssessment(
        operator,
        siteId,
        { viabilityStatus: "potentially_viable", reason },
        store,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe("validation_failed");
        expect(result.failure.details?.missing_fields).toStrictEqual([
          { field: "reason", message: "A reason is required." },
        ]);
      }
      expect(await store.listAssessments(siteId)).toHaveLength(1);
    }
  });

  it("stores the reason trimmed", async () => {
    const { store, siteId } = await submittedStore();

    await overrideAssessment(
      operator,
      siteId,
      { viabilityStatus: "potentially_viable", reason: "  Roof was re-measured.  " },
      store,
    );

    const [, override] = await store.listAssessments(siteId);
    expect(override?.overrideReason).toBe("Roof was re-measured.");
  });

  it("refuses a site that does not exist", async () => {
    const { store } = await submittedStore();

    const result = await overrideAssessment(
      operator,
      "8a2c4d10-5e6f-4b7a-8c9d-0e1f2a3b4cff",
      { viabilityStatus: "potentially_viable", reason: "No such site." },
      store,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("not_found");
  });

  it("refuses a site that has never been screened", async () => {
    const store = createMemoryBackendStore();
    const draft = await createSite(
      owner,
      { ...completeSite, submit: false },
      store,
      viability,
    );
    if (!draft.ok) throw new Error(draft.failure.code);
    expect(await store.listAssessments(draft.value.site.id)).toHaveLength(0);

    const result = await overrideAssessment(
      operator,
      draft.value.site.id,
      { viabilityStatus: "potentially_viable", reason: "Nothing to override yet." },
      store,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.code).toBe("conflict");
  });

  it("overrides the latest result, not the first one", async () => {    const { store, siteId } = await submittedStore();

    await overrideAssessment(
      operator,
      siteId,
      { viabilityStatus: "more_information_required", reason: "First pass." },
      store,
    );
    await overrideAssessment(
      operator,
      siteId,
      { viabilityStatus: "potentially_viable", reason: "Second pass." },
      store,
    );

    const activity = await store.listSiteActivity(siteId);
    const entries = activity.filter((item) => item.action === "assessment_overridden");
    expect(entries).toHaveLength(2);
    expect(entries[1]?.fromValue).toBe("more_information_required");
    expect(entries[1]?.toValue).toBe("potentially_viable");
    expect(await store.listAssessments(siteId)).toHaveLength(3);
  });

  /**
   * The override has to reach the people downstream of it. A project row
   * carries a copy of the screening result, and `DatabaseBackendStore` derives
   * that copy from the latest assessment — so if the in-memory store served a
   * stored copy instead, an operator could mark a site ineligible and the
   * investor portfolio would keep advertising it as potentially viable under
   * `SUNSUM_STORE=mock` while telling the truth under `db`.
   */
  it("reaches the project row the portfolio reads", async () => {
    const { store, siteId } = await submittedStore();
    const accepted = await decideSubmission(
      operator,
      siteId,
      {
        decision: "accept",
        note: null,
        projectName: "Override Test",
        assignedOperatorUserId: null,
      },
      store,
    );
    if (!accepted.ok) throw new Error(accepted.failure.code);

    const before = await store.getProjectBySite(siteId);
    expect(before?.viabilityStatus).toBe("not_currently_eligible");

    await overrideAssessment(
      operator,
      siteId,
      { viabilityStatus: "potentially_viable", reason: "Survey cleared it." },
      store,
    );

    expect((await store.getProjectBySite(siteId))?.viabilityStatus).toBe(
      "potentially_viable",
    );
    expect((await store.getProject(before!.id))?.viabilityStatus).toBe(
      "potentially_viable",
    );
    const listed = (await store.listProjects()).find((item) => item.siteId === siteId);
    expect(listed?.viabilityStatus).toBe("potentially_viable");
  });
});

describe("the override endpoint", () => {
  it("answers 201, because it created an assessment rather than editing one", async () => {
    const { store, siteId } = await submittedStore();

    const response = await handlePostAssessmentOverride(
      request({ viability_status: "potentially_viable", reason: "Cleared on review." }),
      operator,
      siteId,
      store,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      assessment: {
        is_override: boolean;
        override_reason: string | null;
        viability_status: string;
      };
    };
    expect(body.assessment.is_override).toBe(true);
    expect(body.assessment.override_reason).toBe("Cleared on review.");
    expect(body.assessment.viability_status).toBe("potentially_viable");
  });

  it("rejects an unknown viability status instead of storing it", async () => {
    const { store, siteId } = await submittedStore();

    const response = await handlePostAssessmentOverride(
      request({ viability_status: "viable", reason: "Close enough." }),
      operator,
      siteId,
      store,
    );

    expect(response.status).toBe(400);
    expect(await store.listAssessments(siteId)).toHaveLength(1);
  });

  it("rejects unknown keys rather than silently dropping them", async () => {
    const { store, siteId } = await submittedStore();

    const response = await handlePostAssessmentOverride(
      request({
        viability_status: "potentially_viable",
        reason: "Fine.",
        estimated_system_size_kw_low: 9999,
      }),
      operator,
      siteId,
      store,
    );

    expect(response.status).toBe(400);
    expect(await store.listAssessments(siteId)).toHaveLength(1);
  });

  it("rejects a non-string reason", async () => {
    const { store, siteId } = await submittedStore();

    const response = await handlePostAssessmentOverride(
      request({ viability_status: "potentially_viable", reason: 42 }),
      operator,
      siteId,
      store,
    );

    expect(response.status).toBe(400);
  });
});
