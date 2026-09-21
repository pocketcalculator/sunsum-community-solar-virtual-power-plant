// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  JOURNEY_STAGES, createSeed, investorVisible, isInterested, latestAssessment, makeDraft,
  missingFields, reduceLab, visibleActivity, visibleDocuments,
  type LabState, type Site,
} from "@/features/design-lab/model";

const AT = "2026-09-18T12:00:00.000Z";
const find = (state: LabState, id: string): Site => state.sites.find((site) => site.id === id)!;

function stateWith(site: Site, overrides: Partial<LabState> = {}): LabState {
  return { version: 1, sites: [site], engagements: [], mandate: createSeed().mandate, ...overrides };
}

describe("submission intake and screening", () => {
  it("blocks submission while required fields are missing", () => {
    const draft = makeDraft();
    const state = stateWith(draft);
    expect(missingFields(draft).length).toBeGreaterThan(0);
    expect(reduceLab(state, { type: "submit", id: draft.id, result: "potentially_viable" }, AT)).toBe(state);
  });

  it("screens a completed draft and records an assessment", () => {
    const ready: Site = { ...makeDraft(), name: "Rooftop", contactName: "A. Owner", contactEmail: "owner@example.com", address: "1 Example St", area: 1000, consent: true };
    expect(missingFields(ready)).toEqual([]);
    const next = reduceLab(stateWith(ready), { type: "submit", id: ready.id, result: "more_information_required" }, AT);
    const site = find(next, ready.id);
    expect(site.status).toBe("screening");
    expect(site.stage).toBe("screening");
    expect(latestAssessment(site)?.result).toBe("more_information_required");
    expect(site.outstanding).toEqual([]);
  });
});

describe("operator review requires a mandatory note", () => {
  it("keeps the seeded information request off the development ribbon", () => {
    const site = find(createSeed(), "east-point");
    expect(site.status).toBe("info_requested");
    expect(site.stage).toBeNull();
    expect(site.outstanding.length).toBeGreaterThan(0);
  });

  it("rejects an empty note", () => {
    const base = createSeed();
    expect(reduceLab(base, { type: "review", id: "old-fourth", decision: "accept", note: "   " }, AT)).toBe(base);
  });

  it("keeps acceptance separate from explicit project setup and publication", () => {
    const base = createSeed();
    expect(find(base, "old-fourth").status).toBe("screening");
    const next = reduceLab(base, { type: "review", id: "old-fourth", decision: "accept", note: "Meets the criteria" }, AT);
    const site = find(next, "old-fourth");
    expect(site.status).toBe("accepted");
    expect(site.stage).toBeNull();
    expect(site.visible).toBe(false);
    const started = find(reduceLab(next, { type: "start-project", id: site.id }, AT), site.id);
    expect(started.stage).toBe("pre-development");
    expect(started.fundingNeeds.some((need) => need.status === "open")).toBe(true);
    expect(started.visible).toBe(false);
  });

  it("routes request-info into the owner's outstanding list and keeps it off the pipeline", () => {
    const base = createSeed();
    const next = reduceLab(base, { type: "review", id: "old-fourth", decision: "request_info", note: "Send ownership proof" }, AT);
    const site = find(next, "old-fourth");
    expect(site.status).toBe("info_requested");
    expect(site.stage).toBeNull();
    expect(site.outstanding).toContain("Send ownership proof");
  });

  it("declines without ever making the site investor-visible", () => {
    const base = createSeed();
    const site = find(reduceLab(base, { type: "review", id: "old-fourth", decision: "reject", note: "Out of scope" }, AT), "old-fourth");
    expect(site.status).toBe("rejected");
    expect(site.stage).toBeNull();
    expect(site.visible).toBe(false);
  });
});

describe("pipeline advancement", () => {
  it("advances an accepted project and stops at the terminal stage", () => {
    const base = createSeed();
    expect(find(base, "sweet-auburn").stage).toBe("pre-development");
    expect(reduceLab(base, { type: "advance", id: "sweet-auburn" }, AT)).toBe(base);
    const reviewed = reduceLab(base, { type: "task-review", id: "sweet-auburn", taskId: "task-sweet-auburn-milestone", note: "Example feasibility scope reviewed." }, AT);
    let state = reduceLab(reviewed, { type: "advance", id: "sweet-auburn" }, AT);
    expect(find(state, "sweet-auburn").stage).toBe("development");
    for (let index = 0; index < 10; index += 1) state = reduceLab(state, { type: "advance", id: "sweet-auburn" }, AT);
    const site = find(state, "sweet-auburn");
    expect(site.stage).toBe(JOURNEY_STAGES.at(-1)!.id);
    expect(reduceLab(state, { type: "advance", id: "sweet-auburn" }, AT)).toBe(state);
  });

  it("never advances a submission that has not been accepted", () => {
    const base = createSeed();
    expect(reduceLab(base, { type: "advance", id: "old-fourth" }, AT)).toBe(base);
  });
});

describe("investor visibility toggle", () => {
  it("only applies to accepted projects", () => {
    const base = createSeed();
    expect(reduceLab(base, { type: "visibility", id: "old-fourth", visible: true }, AT)).toBe(base);
    const site = find(reduceLab(base, { type: "visibility", id: "sweet-auburn", visible: false }, AT), "sweet-auburn");
    expect(site.visible).toBe(false);
  });
});

describe("append-only assessment overrides", () => {
  it("requires a reason", () => {
    const base = createSeed();
    expect(reduceLab(base, { type: "override", id: "sweet-auburn", result: "not_currently_eligible", reason: "  " }, AT)).toBe(base);
  });

  it("cannot override a site that has never been screened", () => {
    const draft = makeDraft();
    const state = stateWith(draft);
    expect(reduceLab(state, { type: "override", id: draft.id, result: "potentially_viable", reason: "why" }, AT)).toBe(state);
  });

  it("adds a new dated row and never mutates prior assessments", () => {
    const base = createSeed();
    const before = find(base, "sweet-auburn").assessments;
    const originalResult = before[0]!.result;
    const next = reduceLab(base, { type: "override", id: "sweet-auburn", result: "not_currently_eligible", reason: "Structural risk found" }, AT);
    const after = find(next, "sweet-auburn").assessments;
    expect(after).toHaveLength(before.length + 1);
    expect(after[0]!.result).toBe(originalResult);
    expect(after[0]!.overrideReason).toBeUndefined();
    expect(after.at(-1)?.overrideReason).toBe("Structural risk found");
    expect(latestAssessment(find(next, "sweet-auburn"))?.result).toBe("not_currently_eligible");
  });
});

describe("investor interest safeguards", () => {
  it("cannot express interest in a project that is not investor-visible", () => {
    const base = createSeed();
    expect(investorVisible(find(base, "old-fourth"))).toBe(false);
    expect(reduceLab(base, { type: "interest", id: "old-fourth" }, AT)).toBe(base);
  });

  it("requires a completed mandate before interest is accepted", () => {
    const base = createSeed();
    const blocked = { ...base, mandate: { ...base.mandate, completed: false } };
    expect(reduceLab(blocked, { type: "interest", id: "sweet-auburn" }, AT)).toBe(blocked);
  });

  it("rejects interest aimed at a funding need that is not open", () => {
    const base = createSeed();
    expect(reduceLab(base, { type: "interest", id: "sweet-auburn", fundingNeedId: "made-up-need" }, AT)).toBe(base);
  });

  it("records interest against a specific open funding need and can be withdrawn", () => {
    const base = createSeed();
    const need = find(base, "sweet-auburn").fundingNeeds.find((entry) => entry.status === "open")!;
    const engaged = reduceLab(base, { type: "interest", id: "sweet-auburn", fundingNeedId: need.id }, AT);
    expect(isInterested(engaged, "sweet-auburn")).toBe(true);
    expect(engaged.engagements[0]!.fundingNeedId).toBe(need.id);
    const withdrawn = reduceLab(engaged, { type: "withdraw", id: "sweet-auburn" }, AT);
    expect(isInterested(withdrawn, "sweet-auburn")).toBe(false);
  });
});

describe("role-scoped disclosure", () => {
  it("reveals tier-1 documents only to an interested investor and revokes them when visibility is pulled", () => {
    const base = createSeed();
    const site = find(base, "sweet-auburn");
    expect(visibleDocuments(base, site, "site-owner")).toHaveLength(site.documents.length);
    expect(visibleDocuments(base, site, "investor")).toEqual([]);

    const engaged = reduceLab(base, { type: "interest", id: "sweet-auburn" }, AT);
    const engagedSite = find(engaged, "sweet-auburn");
    const investorDocs = visibleDocuments(engaged, engagedSite, "investor");
    expect(investorDocs.length).toBeGreaterThan(0);
    expect(investorDocs.every((doc) => doc.disclosure === "investor_tier_1")).toBe(true);

    const revoked = reduceLab(engaged, { type: "visibility", id: "sweet-auburn", visible: false }, AT);
    expect(visibleDocuments(revoked, find(revoked, "sweet-auburn"), "investor")).toEqual([]);
  });

  it("keeps operator-only activity out of the investor timeline", () => {
    const base = createSeed();
    const withNote = reduceLab(base, { type: "note", id: "sweet-auburn", note: "Internal follow-up" }, AT);
    const site = find(withNote, "sweet-auburn");
    expect(visibleActivity(site, "operator").some((event) => event.kind === "note")).toBe(true);
    expect(visibleActivity(site, "investor").some((event) => event.kind === "note")).toBe(false);
    expect(visibleActivity(site, "investor").every((event) => event.scope === "shared" || event.scope === "investor")).toBe(true);
  });
});
