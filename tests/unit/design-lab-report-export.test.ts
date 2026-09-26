// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createSeed, reduceLab, sourceRevision, type DemoDraft, type LabState,
} from "@/features/design-lab/model";
import {
  DRAFT_TEMPLATES, REPORT_SCHEMA_VERSION, ReportExportError, SYNTHETIC_BASIS,
  createDemoDraft, createPortfolioSnapshot, createRefreshedDraft,
  draftSnapshotAt, exportDraft, exportPortfolio, portfolioSnapshotIssue,
} from "@/features/design-lab/reportExport";

const at = "2026-09-20T07:00:00.000Z";
const later = "2026-09-20T08:00:00.000Z";
const projectId = "sweet-auburn";

function field(draft: DemoDraft, key: string) {
  const found = draft.sourceFields.find((entry) => entry.key === key);
  if (!found) throw new Error(`Missing field ${key}`);
  return found;
}

function draftState(kind: DemoDraft["kind"] = "project_brief") {
  const base = createSeed();
  const draft = createDemoDraft(base, "site-owner", projectId, kind, "draft-original", at);
  return { state: reduceLab(base, { type: "save-draft", draft }, at), draft };
}

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell); cell = "";
    } else if (char === "\r" && text[index + 1] === "\n" && !quoted) {
      row.push(cell); rows.push(row); row = []; cell = ""; index += 1;
    } else cell += char;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

function csvRecords(text: string) {
  const [headers, ...rows] = csvRows(text);
  if (!headers) throw new Error("CSV has no headers");
  for (const row of rows) expect(row).toHaveLength(headers.length);
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

describe("original demo draft prefill and lineage", () => {
  it("captures separate source values, template version, scope and snapshot without changing the source", () => {
    const base = createSeed();
    const source = structuredClone(base);
    const draft = createDemoDraft(base, "site-owner", projectId, "project_brief", "draft-1", at);
    expect(draft.templateVersion).toBe(DRAFT_TEMPLATES.project_brief.version);
    expect(draft.sourceRevision).toBe(sourceRevision(base.sites[0]!));
    expect(draftSnapshotAt(draft)).toBe(at);
    expect(field(draft, "project_name")).toMatchObject({ value: base.sites[0]!.name, sourceValue: base.sites[0]!.name });
    expect(field(draft, "owner_name").value).toBe(base.sites[0]!.contactName);
    expect(field(draft, "owner_goals").value).toBe("Not recorded");
    expect(draft.review).toBe("draft");
    expect(draft.content).toContain("creates no lease");
    expect(base).toEqual(source);
  });

  it("rejects an unauthorized owner project, investor draft creation and duplicate draft ids", () => {
    const { state } = draftState();
    expect(() => createDemoDraft(state, "site-owner", "preview-07", "project_brief", "new", at)).toThrow(/not available/);
    expect(() => createDemoDraft(state, "investor", projectId, "project_brief", "new", at)).toThrow(/Draft fields are not available/);
    expect(() => createDemoDraft(state, "site-owner", projectId, "project_brief", "draft-original", at)).toThrow(/unused identifier/);
  });

  it("keeps original, current and human assessment records distinct with unknown provider and criteria", () => {
    const base = createSeed();
    const rerun = reduceLab(base, { type: "rerun", id: projectId, result: "more_information_required", reason: "Fictional comparison" }, later);
    const failed = reduceLab(rerun, { type: "screen-failure", id: projectId }, later);
    const draft = createDemoDraft(failed, "operator", projectId, "assessment_report", "assessment-draft", later);
    expect(field(draft, "source_original_assessment").sourceValue).toContain("Potentially viable");
    expect(field(draft, "source_current_assessment").sourceValue).toContain("More information needed");
    expect(field(draft, "source_current_assessment").sourceValue).toContain("Manually selected synthetic result");
    expect(field(draft, "source_human_decision").sourceValue).toContain("Accepted for project setup");
    expect(field(draft, "source_reconfirmation").sourceValue).toContain("Reconfirmation required");
    expect(field(draft, "source_provider").sourceValue).toContain("No connected provider or AI service");
    expect(field(draft, "source_unknowns").sourceValue).toContain("Grid interconnection: unknown");
    expect(field(draft, "source_last_attempt").sourceValue).toContain("last successful assessment is retained");
    expect(field(draft, "source_current_assessment").sourceValue).not.toContain("Fictional comparison");
    expect(draft.templateVersion).not.toBe(DRAFT_TEMPLATES.project_brief.version);
  });

  it("refreshes into a new copy while retaining corrections, narrative and the earlier saved source", () => {
    const { state, draft } = draftState();
    field(draft, "project_name").value = "Corrected briefing name";
    draft.title = "Keep my title";
    draft.content = "Keep my original narrative.";
    const saved = reduceLab(state, { type: "save-draft", draft }, at);
    const previous = structuredClone(saved.drafts![0]!);
    const changed: LabState = {
      ...saved, sites: saved.sites.map((site) => site.id === projectId
        ? { ...site, name: "Changed source name", locality: "Changed source locality", revision: 1 } : site),
    };
    const fresh = createRefreshedDraft(changed, "site-owner", draft.id, "draft-refreshed", later);
    expect(fresh.id).not.toBe(draft.id);
    expect(fresh.title).toBe("Keep my title");
    expect(fresh.content).toBe("Keep my original narrative.");
    expect(field(fresh, "project_name")).toMatchObject({ value: "Corrected briefing name", sourceValue: "Changed source name" });
    expect(field(fresh, "locality").value).toBe("Changed source locality / GA");
    expect(field(fresh, "source_previous_draft").value).toBe(draft.id);
    expect(draftSnapshotAt(fresh)).toBe(later);
    expect(fresh.review).toBe("draft");
    expect(changed.drafts).toEqual([previous]);
  });

  it("preserves unavailable-template drafts rather than silently substituting a different template", () => {
    const { state, draft } = draftState();
    const legacy = reduceLab(state, { type: "save-draft", draft: { ...draft, templateVersion: "unavailable-v0" } }, at);
    expect(() => createRefreshedDraft(legacy, "site-owner", draft.id, "new", later)).toThrow(/template version is unavailable/);
    expect(exportDraft(legacy, "site-owner", draft.id, "html").content).toContain("unavailable-v0");
  });
});

describe("scoped portfolio DTO and exports", () => {
  it("names selected versus all-permitted scopes and preserves stable ordering, headers and role counts", () => {
    const state = createSeed();
    const owner = createPortfolioSnapshot(state, "site-owner", { kind: "all_permitted" }, at);
    const operator = createPortfolioSnapshot(state, "operator", { kind: "all_permitted" }, at);
    const investor = createPortfolioSnapshot(state, "investor", { kind: "all_permitted" }, at);
    expect(owner.projects).toHaveLength(6);
    expect(operator.projects).toHaveLength(50);
    expect(investor.projects).toHaveLength(47);
    expect(operator.projects.map((project) => project.id)).toEqual(operator.projects.map((project) => project.id).sort());
    const selected = createPortfolioSnapshot(state, "operator", { kind: "selected", siteId: projectId }, at);
    expect(selected.projects).toHaveLength(1);
    expect(selected.scopeLabel).toBe("Selected project");
    const artifact = exportPortfolio(state, "operator", operator, "csv");
    expect(artifact.filename).toContain("portfolio-summary-all-permitted-operator");
    expect(artifact.filename).toMatch(/\.csv$/);
    expect(artifact.mimeType).toBe("text/csv;charset=utf-8");
    const records = csvRecords(artifact.content);
    expect(records).toHaveLength(50);
    expect(records[0]).toMatchObject({ schema_version: REPORT_SCHEMA_VERSION, artifact: "portfolio_summary", basis: SYNTHETIC_BASIS, scope: "All permitted projects", snapshot_utc: at, demo_role: "operator" });
    expect(exportPortfolio(state, "operator", selected, "html").content).toContain("No filters from another screen are applied");
  });

  it("never widens unavailable selected scope into an all-project export", () => {
    const state = createSeed();
    expect(() => createPortfolioSnapshot(state, "investor", { kind: "selected", siteId: "grove-park" }, at)).toThrow(/not available/);
    expect(() => createPortfolioSnapshot(state, "site-owner", { kind: "selected", siteId: "preview-07" }, at)).toThrow(/not available/);
    expect(() => createPortfolioSnapshot({ ...state, sites: [] }, "operator", { kind: "all_permitted" }, at)).toThrow(/no permitted projects/);
    expect(() => createPortfolioSnapshot(state, "operator", { kind: "all_permitted" }, "not-a-date")).toThrow(/timestamp with a time zone/);
  });

  it("does not turn unknown ranges into zero or convert the recorded energy units", () => {
    const state = createSeed();
    const assessment = state.sites[0]!.assessments[0]!;
    assessment.capacity = [0, 0];
    assessment.generation = null;
    const snapshot = createPortfolioSnapshot(state, "site-owner", { kind: "selected", siteId: projectId }, at);
    const record = csvRecords(exportPortfolio(state, "site-owner", snapshot, "csv").content)[0]!;
    expect(record.capacity_min_kw).toBe("0");
    expect(record.capacity_max_kw).toBe("0");
    expect(record.annual_generation_min_kwh).toBe("Unknown");
    expect(record.annual_generation_max_kwh).toBe("Unknown");
    assessment.generation = [243000, 324000];
    const withEnergy = createPortfolioSnapshot(state, "site-owner", { kind: "selected", siteId: projectId }, at);
    expect(csvRecords(exportPortfolio(state, "site-owner", withEnergy, "csv").content)[0]).toMatchObject({
      annual_generation_min_kwh: "243000", annual_generation_max_kwh: "324000", financial_outputs: "Not calculated",
    });
    assessment.capacity = [20, 10];
    expect(() => createPortfolioSnapshot(state, "site-owner", { kind: "selected", siteId: projectId }, at)).toThrow(/range is reversed/);
  });

  it("keeps acceptance separate from project setup and does not infer a missing human decision", () => {
    const state = createSeed();
    const site = state.sites[0]!;
    site.stage = null;
    site.assessments = [];
    delete site.decisions;
    delete site.evidenceRevision;
    const snapshot = createPortfolioSnapshot(state, "operator", { kind: "selected", siteId: projectId }, at);
    expect(snapshot.projects[0]).toMatchObject({ submissionStatus: "accepted", stage: "Awaiting project setup", assessmentVersion: null });
    const draft = createDemoDraft(state, "operator", projectId, "assessment_report", "unknown-assessment", at);
    expect(field(draft, "source_human_decision").sourceValue).toContain("Unknown - no human decision recorded");
    expect(field(draft, "source_original_assessment").sourceValue).toContain("no assessment recorded");
    expect(field(draft, "source_evidence").sourceValue).toContain("Evidence revision: Unknown");
  });

  it("exports only allowlisted public and permitted diligence metadata, never investor private or draft fields", () => {
    const { state, draft } = draftState();
    const site = state.sites[0]!;
    site.address = "PRIVATE_ADDRESS_SENTINEL";
    site.contactName = "PRIVATE_OWNER_SENTINEL";
    site.contactEmail = "PRIVATE_CONTACT_SENTINEL";
    site.assignee = "PRIVATE_ASSIGNEE_SENTINEL";
    site.notes = [{ id: "note", text: "PRIVATE_NOTE_SENTINEL", createdAt: at, updatedAt: at, previous: [] }];
    site.assessments[0]!.overrideReason = "PRIVATE_REASON_SENTINEL";
    site.documents[0]!.name = "Permitted diligence metadata.pdf";
    site.documents[1]!.name = "PRIVATE_DOCUMENT_SENTINEL.pdf";
    state.drafts![0]!.content = "PRIVATE_DRAFT_SENTINEL";
    state.drafts!.push({ ...draft, id: "legacy-investor-draft", authorRole: "investor", content: "INVESTOR_DRAFT_SENTINEL" });
    const beforeInterest = createPortfolioSnapshot(state, "investor", { kind: "selected", siteId: projectId }, at);
    expect(beforeInterest.projects[0]!.documents).toEqual([]);
    const interested = reduceLab(state, { type: "interest", id: projectId }, at);
    const snapshot = createPortfolioSnapshot(interested, "investor", { kind: "selected", siteId: projectId }, at);
    expect(snapshot.projects[0]!.documents).toHaveLength(1);
    expect(Object.keys(snapshot.projects[0]!).sort()).toEqual([
      "id", "name", "locality", "region", "type", "submissionStatus", "stage", "sourceRevision",
      "assessmentId", "assessmentVersion", "assessmentAt", "screening", "capacityMinKw", "capacityMaxKw",
      "generationMinKwhPerYear", "generationMaxKwhPerYear", "documents",
    ].sort());
    for (const format of ["html", "csv"] as const) {
      const artifact = exportPortfolio(interested, "investor", snapshot, format);
      expect(artifact.content).toContain("Permitted diligence metadata.pdf");
      expect(artifact.content).toContain("Metadata only");
      expect(artifact.content).not.toMatch(/PRIVATE_[A-Z_]+_SENTINEL|INVESTOR_DRAFT_SENTINEL/);
      expect(() => exportDraft(interested, "investor", draft.id, format)).toThrow(ReportExportError);
      expect(() => exportDraft(interested, "investor", "legacy-investor-draft", format)).toThrow(ReportExportError);
    }
    expect(exportPortfolio(state, "investor", beforeInterest, "html").content).not.toContain("Permitted diligence metadata.pdf");
  });

  it("rechecks authorization and invalidates source changes, including withdrawal and publication revocation", () => {
    const state = reduceLab(createSeed(), { type: "interest", id: projectId }, at);
    const snapshot = createPortfolioSnapshot(state, "investor", { kind: "selected", siteId: projectId }, at);
    const withdrawn = reduceLab(state, { type: "withdraw", id: projectId }, later);
    expect(portfolioSnapshotIssue(withdrawn, "investor", snapshot)?.hidePreview).toBe(true);
    expect(() => exportPortfolio(withdrawn, "investor", snapshot, "csv")).toThrow(/access changed/);
    const hidden = reduceLab(state, { type: "visibility", id: projectId, visible: false }, later);
    expect(() => exportPortfolio(hidden, "investor", snapshot, "html")).toThrow(/access changed/);
    const changed = reduceLab(state, { type: "assign", id: projectId, assignee: "Demo reviewer", nextAction: "Example change", targetDate: "" }, later);
    expect(portfolioSnapshotIssue(changed, "investor", snapshot)).toMatchObject({ hidePreview: false });
    expect(() => exportPortfolio(changed, "investor", snapshot, "html")).toThrow(/Refresh the summary snapshot/);
    expect(() => exportPortfolio(state, "site-owner", snapshot, "html")).toThrow(/access changed/);
  });
});

describe("actual file contents and escaping", () => {
  it("escapes public project text and permitted document metadata in portfolio HTML", () => {
    const state = reduceLab(createSeed(), { type: "interest", id: projectId }, at);
    state.sites[0]!.name = '<img src="x" onerror="alert(1)">';
    state.sites[0]!.documents[0]!.name = '<script>not a file</script>.pdf';
    const snapshot = createPortfolioSnapshot(state, "investor", { kind: "selected", siteId: projectId }, at);
    const artifact = exportPortfolio(state, "investor", snapshot, "html");
    expect(artifact.content).toContain("&lt;img src=&quot;x&quot;");
    expect(artifact.content).toContain("&lt;script&gt;not a file&lt;/script&gt;.pdf");
    expect(artifact.content).not.toContain("<img ");
    expect(artifact.content).not.toContain("<script>");
    expect(artifact.content).not.toContain("<a ");
  });

  it("produces self-contained escaped UTF-8 HTML, not executable user markup or a renamed PDF", async () => {
    const { state, draft } = draftState();
    draft.title = '"><script>alert("x")</script>& caf\u00e9';
    draft.content = '<img src="https://example.invalid/x" onerror="alert(1)">\nOriginal text & "quotes".';
    field(draft, "project_name").value = "<svg onload='alert(2)'>corrected</svg>";
    const saved = reduceLab(state, { type: "save-draft", draft }, at);
    const artifact = exportDraft(saved, "site-owner", draft.id, "html");
    expect(artifact.mimeType).toBe("text/html;charset=utf-8");
    expect(artifact.filename).toMatch(/^sunroom-project-briefing-[a-z0-9_-]+\.html$/);
    expect(artifact.content).toContain('<meta charset="utf-8">');
    expect(artifact.content).toContain("Content-Security-Policy");
    expect(artifact.content).toContain("&lt;script&gt;");
    expect(artifact.content).toContain("&lt;svg onload=&#39;alert(2)&#39;&gt;");
    expect(artifact.content).toContain("&quot;quotes&quot;");
    expect(artifact.content).not.toContain("<script>");
    expect(artifact.content).not.toContain("<img ");
    expect(artifact.content).not.toContain("<svg ");
    expect(artifact.content).toContain("Non-executing demo draft");
    const blob = new Blob([artifact.content], { type: artifact.mimeType });
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe(artifact.content);
    expect(blob.size).toBeGreaterThan(artifact.content.length);
  });

  it.each(["=1+1", "+SUM(1,2)", "-1+2", "@SUM(1,2)", " \t=1+1", "\r\n@SUM(1,2)", "\u0000\u001b=1+1", "\u007f\u0085-1+2", "\ufeff\u200b+SUM(1,2)"])(
    "neutralizes formula text including invisible prefixes: %j", (malicious) => {
      const state = createSeed();
      state.sites[0]!.name = malicious;
      const snapshot = createPortfolioSnapshot(state, "operator", { kind: "selected", siteId: projectId }, at);
      const records = csvRecords(exportPortfolio(state, "operator", snapshot, "csv").content);
      expect(records[0]!.project_name).toBe(`'${malicious}`);
    },
  );

  it("quotes commas, quotes and newlines and retains correction-versus-source columns in draft CSV", () => {
    const { state, draft } = draftState();
    draft.content = 'An original "review", on two lines.\r\nThis is the second line.';
    field(draft, "owner_goals").value = ' \t=HYPERLINK("https://example.invalid","x")';
    const saved = reduceLab(state, { type: "save-draft", draft }, at);
    const artifact = exportDraft(saved, "site-owner", draft.id, "csv");
    expect(artifact.filename).toMatch(/\.csv$/);
    expect(artifact.content).toContain('""review""');
    expect(artifact.content.endsWith("\r\n")).toBe(true);
    const rows = csvRecords(artifact.content);
    expect(rows.find((row) => row.field_key === "draft_body")?.draft_value).toBe(draft.content);
    expect(rows.find((row) => row.field_key === "owner_goals")).toMatchObject({
      draft_value: `'${field(draft, "owner_goals").value}`, stored_source_value: "Not recorded",
      source_snapshot_utc: at, source_revision: draft.sourceRevision, review_state: "Unreviewed demo draft",
    });
  });

  it("labels unreviewed and stale report bytes honestly while preserving the recorded snapshot and historical review", () => {
    const { state, draft } = draftState("assessment_report");
    expect(exportDraft(state, "site-owner", draft.id, "html").content).toContain("Unreviewed demo draft");
    const reviewed = reduceLab(state, { type: "review-draft", draftId: draft.id, role: "operator" }, at);
    const current = exportDraft(reviewed, "site-owner", draft.id, "html");
    expect(current.filename).toContain("assessment-report");
    expect(current.content).toContain("Human-reviewed demo draft");
    const changed = reduceLab(reviewed, { type: "rerun", id: projectId, result: "more_information_required", reason: "Example evidence" }, later);
    const old = exportDraft(changed, "site-owner", draft.id, "html");
    expect(old.content).toContain("Source changed - review required");
    expect(old.content).toContain("previous human review is historical");
    expect(old.content).toContain(draft.sourceRevision);
    expect(old.content).toContain(at);
    expect(old.content).not.toContain(">Human-reviewed demo draft<");
    expect(reduceLab(changed, { type: "review-draft", draftId: draft.id, role: "operator" }, later)).toBe(changed);
  });
});
