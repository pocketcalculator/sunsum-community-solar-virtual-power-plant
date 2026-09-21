// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSeed, needsReconfirmation, reduceLab, roleSites, sourceRevision, stageBlockers, visibleActivity, visibleDrafts, type DemoDraft } from "@/features/design-lab/model";
import { parseStoredState, serializePreview } from "@/features/design-lab/store";

const at = "2026-09-20T01:00:00.000Z";

describe("versioned synthetic workspace", () => {
  it("has exactly 50 unique fictional records and a smaller owner projection", () => {
    const state = createSeed();
    expect(state.sites).toHaveLength(50);
    expect(new Set(state.sites.map((site) => site.id)).size).toBe(50);
    expect(roleSites(state, "site-owner")).toHaveLength(6);
    expect(roleSites(state, "investor")).toHaveLength(47);
    expect(state.sites.every((site) => site.contactEmail.endsWith("@example.invalid"))).toBe(true);
  });
  it("round trips its v2 envelope without changing legacy data or ids", () => {
    const state = createSeed();
    const legacy = { version: 1, sites: state.sites.slice(0, 6), mandate: state.mandate, engagements: [] };
    expect(parseStoredState(JSON.stringify(legacy))).toEqual(legacy);
    expect(parseStoredState(serializePreview(state))).toEqual(state);
    expect(parseStoredState(JSON.stringify({ schemaVersion: 2, mode: "connected", state }))).toBeNull();
    expect(parseStoredState(JSON.stringify({ ...state, profile: { name: "broken" } }))).toBeNull();
    expect(parseStoredState(JSON.stringify({ ...state, sites: [{ ...state.sites[0], tasks: ["broken"] }] }))).toBeNull();
    expect(parseStoredState(JSON.stringify({ ...state, sites: [{ ...state.sites[0], targetDate: "not-a-date" }] }))).toBeNull();
    expect(parseStoredState(JSON.stringify({ ...state, sites: [{ ...state.sites[0], reviewRequired: "broken" }] }))).toBeNull();
  });
});

describe("explicit human steps", () => {
  it.each(["rerun", "override", "document"] as const)("requires a current review after %s on a genuine legacy accepted project", (change) => {
    const base = createSeed();
    base.sites = base.sites.slice(0, 6);
    delete base.profile;
    delete base.drafts;
    for (const site of base.sites) {
      delete site.ownerVisible;
      delete site.tasks;
      delete site.decisions;
      delete site.notes;
      delete site.evidenceRevision;
      delete site.revision;
    }
    const payload = JSON.stringify(base);
    const restored = parseStoredState(payload)!;
    const before = restored.sites.find((site) => site.id === "grove-park")!;
    expect(before.decisions).toBeUndefined();
    expect(needsReconfirmation(before)).toBe(false);
    const changed = reduceLab(restored, change === "document" ? {
      type: "document", id: before.id, actor: "site-owner",
      document: { id: "new-legacy-evidence", name: "Fictional roof.jpg", kind: "photo",
        size: 128, disclosure: "owner_private", createdAt: at },
    } : { type: change, id: before.id, result: "more_information_required", reason: "Changed example evidence" }, at);
    const site = changed.sites.find((item) => item.id === before.id)!;
    expect(needsReconfirmation(site)).toBe(true);
    expect(site.decisions).toBeUndefined();
    expect(reduceLab(changed, { type: "advance", id: site.id }, at)).toBe(changed);
    expect(reduceLab(changed, { type: "visibility", id: site.id, visible: true }, at)).toBe(changed);
    const reloaded = parseStoredState(serializePreview(changed))!;
    expect(needsReconfirmation(reloaded.sites.find((item) => item.id === site.id)!)).toBe(true);
    const confirmed = reduceLab(reloaded, { type: "confirm-review", id: site.id, note: "Reviewed the current example sources" }, at);
    const current = confirmed.sites.find((item) => item.id === site.id)!;
    expect(needsReconfirmation(current)).toBe(false);
    expect(current.decisions).toHaveLength(1);
    expect(reduceLab(confirmed, { type: "advance", id: site.id }, at).sites.find((item) => item.id === site.id)!.stage).toBe("development");
    expect(reduceLab(confirmed, { type: "visibility", id: site.id, visible: true }, at).sites.find((item) => item.id === site.id)!.visible).toBe(true);
    expect(JSON.stringify(restored)).toBe(payload);
  });
  it("clears the current assessment failure after successful owner resubmission without erasing its history", () => {
    const failed = reduceLab(createSeed(), { type: "screen-failure", id: "east-point" }, at);
    const before = failed.sites.find((site) => site.id === "east-point")!;
    expect(before.assessmentError).toBeTruthy();
    const submitted = reduceLab(failed, { type: "submit", id: before.id, result: "potentially_viable" }, at);
    const site = submitted.sites.find((item) => item.id === before.id)!;
    expect(site.status).toBe("screening");
    expect(site.assessments).toHaveLength(before.assessments.length + 1);
    expect(site.assessmentError).toBeNull();
    expect(site.activity).toContainEqual(before.activity.at(-1));
    expect(site.activity.at(-1)?.kind).toBe("submission");
  });
  it("leaves old assessments and decisions intact after a manual rerun", () => {
    const base = createSeed();
    const before = base.sites[0]!;
    const next = reduceLab(base, { type: "rerun", id: before.id, result: "more_information_required", reason: "New example evidence" }, at);
    const site = next.sites[0]!;
    expect(site.assessments[0]).toEqual(before.assessments[0]);
    expect(site.decisions).toEqual(before.decisions);
    expect(needsReconfirmation(site)).toBe(true);
    expect(stageBlockers(site)).toContain("Reconfirm the human decision after evidence or assessment changes");
    const failed = reduceLab(next, { type: "screen-failure", id: site.id }, at).sites[0]!;
    expect(failed.assessments).toEqual(site.assessments);
    expect(failed.assessmentError).toContain("last successful assessment");
  });
  it("saves and edits a private note without advancing a project", () => {
    const base = createSeed();
    const saved = reduceLab(base, { type: "save-note", id: "sweet-auburn", text: "Example note" }, at);
    const note = saved.sites[0]!.notes![0]!;
    const edited = reduceLab(saved, { type: "save-note", id: "sweet-auburn", noteId: note.id, text: "Corrected note" }, at).sites[0]!;
    expect(edited.stage).toBe(base.sites[0]!.stage);
    expect(edited.notes![0]!.previous[0]!.text).toBe("Example note");
    expect(visibleActivity(edited, "site-owner").some((event) => event.detail.includes("Corrected note"))).toBe(false);
  });
  it("creates one minimal owner notice per new interest, never relabeling private events", () => {
    const base = createSeed();
    const first = reduceLab(base, { type: "interest", id: "sweet-auburn" }, at);
    expect(reduceLab(first, { type: "interest", id: "sweet-auburn" }, at)).toBe(first);
    const owner = visibleActivity(first.sites[0]!, "site-owner");
    expect(owner.filter((event) => event.kind === "owner_interest")).toHaveLength(1);
    expect(owner.some((event) => event.kind === "interest")).toBe(false);
    const withdrawn = reduceLab(first, { type: "withdraw", id: "sweet-auburn" }, at);
    expect(visibleActivity(withdrawn.sites[0]!, "site-owner").filter((event) => event.kind === "owner_interest")).toHaveLength(1);
    const again = reduceLab(withdrawn, { type: "interest", id: "sweet-auburn" }, at);
    expect(visibleActivity(again.sites[0]!, "site-owner").filter((event) => event.kind === "owner_interest")).toHaveLength(2);
  });
});

describe("draft lineage and disclosure", () => {
  it("requires a current source snapshot for human review and keeps owner drafts out of investor exports", () => {
    const state = createSeed();
    const draft: DemoDraft = {
      id: "draft-1", siteId: "sweet-auburn", title: "Example project brief", kind: "project_brief",
      content: "Synthetic, non-executing draft", templateVersion: "demo-1", sourceFields: [],
      sourceRevision: sourceRevision(state.sites[0]!), authorRole: "site-owner",
      createdAt: at, updatedAt: at, review: "draft", reviewedAt: null,
    };
    const saved = reduceLab(state, { type: "save-draft", draft }, at);
    expect(visibleDrafts(saved, "investor")).toEqual([]);
    const reviewed = reduceLab(saved, { type: "review-draft", draftId: draft.id, role: "site-owner" }, at);
    expect(reviewed.drafts![0]!.review).toBe("reviewed");
    const changed = reduceLab(saved, { type: "assign", id: "sweet-auburn", assignee: "Example reviewer", nextAction: "Changed", targetDate: "" }, at);
    expect(reduceLab(changed, { type: "review-draft", draftId: draft.id, role: "site-owner" }, at)).toBe(changed);
  });
});
