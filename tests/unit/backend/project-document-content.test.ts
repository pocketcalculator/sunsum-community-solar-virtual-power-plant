// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Viewer } from "@/backend/core/identity";
import { createSite, type SiteCreateInput, type ViabilityClient } from "@/backend/core/sites";
import { decideSubmission, updateProjectVisibility } from "@/backend/core/projects";
import { expressInterest } from "@/backend/core/engagements";
import { getDealRoom } from "@/backend/core/views";
import { createMemoryBackendStore } from "@/backend/core/store";
import {
  addProjectDocument,
  getProjectDocumentContent,
  putProjectDocumentContent,
  type DocumentCreateInput,
} from "@/backend/core/documents";
import { formatBlobPath, parseBlobPath } from "@/backend/core";
import {
  InMemoryDocumentBlobClient,
  resetDocumentBlobClient,
} from "@/backend/blob";
import {
  handleGetProjectDocumentContent,
  handlePostProjectDocument,
  handlePutProjectDocumentContent,
} from "@/backend/handlers";

const owner: Viewer = {
  role: "site_owner",
  userId: "cd865e91-942b-48d3-a6f1-7b2053e4c890",
};
const otherOwner: Viewer = {
  role: "site_owner",
  userId: "f98dc14c-e7a8-45f1-9310-27b8f490169d",
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
const unonboardedInvestor: Viewer = {
  ...investor,
  userId: "3b0b5d1f-2b6a-49a7-9f1e-5c9a1d7e8f20",
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

/** A PDF magic number, standing in for a generated underwriting report. */
const REPORT = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function reportInput(overrides: Partial<DocumentCreateInput> = {}): DocumentCreateInput {
  return {
    originalFilename: "underwriting.pdf",
    contentType: "application/pdf",
    sizeBytes: REPORT.byteLength,
    docType: "screening_report",
    disclosureClass: "owner_private",
    ...overrides,
  };
}

/** An accepted site, so a project exists to hang a generated report off. */
async function acceptedStore() {
  const store = createMemoryBackendStore();
  const created = await createSite(owner, completeSite, store, viability);
  if (!created.ok) throw new Error(created.failure.code);
  const siteId = created.value.site.id;
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
  if (!accepted.ok || accepted.value.project === undefined) throw new Error("accept failed");
  return { store, siteId, projectId: accepted.value.project.id };
}

/** An accepted project with one registered report, defaulting to owner-private. */
async function registeredStore(overrides: Partial<DocumentCreateInput> = {}) {
  const { store, siteId, projectId } = await acceptedStore();
  const added = await addProjectDocument(operator, projectId, reportInput(overrides), store);
  if (!added.ok) throw new Error(added.failure.code);
  return { store, siteId, projectId, documentId: added.value.id };
}

/** Makes the project investor-visible and gives `investor` a tier-one engagement. */
async function engage(store: ReturnType<typeof createMemoryBackendStore>, projectId: string) {
  await updateProjectVisibility(operator, projectId, true, store);
  const interest = await expressInterest(investor, projectId, null, store);
  if (!interest.ok) throw new Error(interest.failure.code);
}

describe("project document registration", () => {
  it("files the report under the project, not the site", async () => {
    const { store, projectId, documentId } = await registeredStore();
    const [record] = await store.listDocuments(
      "00000000-0000-4000-8000-000000000000",
      projectId,
    );
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.id).toBe(documentId);
    expect(record.projectId).toBe(projectId);
    expect(record.siteId).toBeNull();

    const location = parseBlobPath(record.blobPath);
    expect(location).not.toBeNull();
    if (location === null) return;
    expect(formatBlobPath(location)).toContain(
      `owners/${owner.userId}/projects/${projectId}/`,
    );
  });

  it("routes the blob to the container its disclosure class implies", async () => {
    const privateReport = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();
    await putProjectDocumentContent(
      operator,
      privateReport.projectId,
      privateReport.documentId,
      REPORT,
      blob,
      privateReport.store,
    );
    expect(blob.countByContainer("site-documents")).toBe(1);
    expect(blob.countByContainer("project-documents")).toBe(0);

    const shared = await registeredStore({ disclosureClass: "investor_tier_1" });
    const sharedBlob = new InMemoryDocumentBlobClient();
    await putProjectDocumentContent(
      operator,
      shared.projectId,
      shared.documentId,
      REPORT,
      sharedBlob,
      shared.store,
    );
    expect(sharedBlob.countByContainer("project-documents")).toBe(1);
    expect(sharedBlob.countByContainer("site-documents")).toBe(0);
  });

  it("refuses every role except the operator", async () => {
    const { store, projectId } = await acceptedStore();
    for (const viewer of [owner, investor]) {
      const attempt = await addProjectDocument(viewer, projectId, reportInput(), store);
      expect(attempt.ok).toBe(false);
      if (!attempt.ok) expect(attempt.failure.code).toBe("forbidden_role");
    }
  });

  it("reports not_found for a project that does not exist", async () => {
    const { store } = await acceptedStore();
    const missing = await addProjectDocument(
      operator,
      "00000000-0000-4000-8000-000000000000",
      reportInput(),
      store,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.failure.code).toBe("not_found");
  });
});

describe("project document content", () => {
  it("round-trips bytes for the operator who generated the report", async () => {
    const { store, projectId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();

    const uploaded = await putProjectDocumentContent(
      operator,
      projectId,
      documentId,
      REPORT,
      blob,
      store,
    );
    expect(uploaded.ok).toBe(true);

    const read = await getProjectDocumentContent(operator, projectId, documentId, blob, store);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(Array.from(read.value.content)).toEqual(Array.from(REPORT));
    expect(read.value.contentType).toBe("application/pdf");
    expect(read.value.originalFilename).toBe("underwriting.pdf");
  });

  it("reports not_found when the record exists but nothing was uploaded", async () => {
    const { store, projectId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();
    const read = await getProjectDocumentContent(operator, projectId, documentId, blob, store);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.failure.code).toBe("not_found");
  });

  it("applies the same size rules as a site upload", async () => {
    const { store, projectId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();

    const empty = await putProjectDocumentContent(
      operator,
      projectId,
      documentId,
      new Uint8Array(0),
      blob,
      store,
    );
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.failure.code).toBe("invalid_body");

    const mismatch = await putProjectDocumentContent(
      operator,
      projectId,
      documentId,
      new Uint8Array([1, 2, 3, 4, 5]),
      blob,
      store,
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.failure.details).toMatchObject({
        expected_size_bytes: REPORT.byteLength,
        received_size_bytes: 5,
      });
    }
  });

  it("does not resolve a document id belonging to a different project", async () => {
    const { store, projectId, documentId } = await registeredStore();
    const second = await createSite(
      owner,
      { ...completeSite, addressRaw: "2 Other Street, Atlanta, GA" },
      store,
      viability,
    );
    if (!second.ok) throw new Error(second.failure.code);
    const accepted = await decideSubmission(
      operator,
      second.value.site.id,
      { decision: "accept", note: null, projectName: "Other Solar", assignedOperatorUserId: null },
      store,
    );
    if (!accepted.ok || accepted.value.project === undefined) throw new Error("accept failed");

    const blob = new InMemoryDocumentBlobClient();
    await putProjectDocumentContent(operator, projectId, documentId, REPORT, blob, store);

    const crossed = await getProjectDocumentContent(
      operator,
      accepted.value.project.id,
      documentId,
      blob,
      store,
    );
    expect(crossed.ok).toBe(false);
    if (!crossed.ok) expect(crossed.failure.code).toBe("not_found");
    // Against its own project the identical call succeeds, so the id is sound.
    expect(
      await getProjectDocumentContent(operator, projectId, documentId, blob, store),
    ).toMatchObject({ ok: true });
  });
});

describe("who may download a project document", () => {
  it("lets the site owner read a report about their own project", async () => {
    const { store, projectId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();
    await putProjectDocumentContent(operator, projectId, documentId, REPORT, blob, store);

    const read = await getProjectDocumentContent(owner, projectId, documentId, blob, store);
    expect(read.ok).toBe(true);

    const foreign = await getProjectDocumentContent(otherOwner, projectId, documentId, blob, store);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.failure.code).toBe("forbidden_owner");
  });

  it("lets an engaged investor download exactly what the deal room listed", async () => {
    const { store, projectId, documentId } = await registeredStore({
      disclosureClass: "investor_tier_1",
    });
    const blob = new InMemoryDocumentBlobClient();
    await putProjectDocumentContent(operator, projectId, documentId, REPORT, blob, store);
    await engage(store, projectId);

    // The deal room advertises it...
    const dealRoom = await getDealRoom(investor, projectId, store);
    expect(dealRoom.ok).toBe(true);
    if (!dealRoom.ok) return;
    expect(JSON.stringify(dealRoom.value)).toContain(documentId);

    // ...and the investor can now actually fetch the bytes behind it.
    const read = await getProjectDocumentContent(investor, projectId, documentId, blob, store);
    expect(read.ok).toBe(true);
    if (read.ok) expect(Array.from(read.value.content)).toEqual(Array.from(REPORT));
  });

  it("hides an owner-private report from an investor entirely", async () => {
    const { store, projectId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();
    await putProjectDocumentContent(operator, projectId, documentId, REPORT, blob, store);
    await engage(store, projectId);

    const dealRoom = await getDealRoom(investor, projectId, store);
    expect(dealRoom.ok).toBe(true);
    if (dealRoom.ok) expect(JSON.stringify(dealRoom.value)).not.toContain(documentId);

    // `not_found`, not a forbidden code: the investor must not learn it exists.
    const read = await getProjectDocumentContent(investor, projectId, documentId, blob, store);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.failure.code).toBe("not_found");
  });

  it("requires onboarding, visibility and a live engagement, in that order", async () => {
    const { store, projectId, documentId } = await registeredStore({
      disclosureClass: "investor_tier_1",
    });
    const blob = new InMemoryDocumentBlobClient();
    await putProjectDocumentContent(operator, projectId, documentId, REPORT, blob, store);

    const unonboarded = await getProjectDocumentContent(
      unonboardedInvestor,
      projectId,
      documentId,
      blob,
      store,
    );
    expect(unonboarded.ok).toBe(false);
    if (!unonboarded.ok) expect(unonboarded.failure.code).toBe("forbidden_tier");

    // Onboarded, but the operator has not published the project.
    const hidden = await getProjectDocumentContent(investor, projectId, documentId, blob, store);
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.failure.code).toBe("not_found");

    // Published, but no engagement yet.
    await updateProjectVisibility(operator, projectId, true, store);
    const unengaged = await getProjectDocumentContent(investor, projectId, documentId, blob, store);
    expect(unengaged.ok).toBe(false);
    if (!unengaged.ok) expect(unengaged.failure.code).toBe("forbidden_tier");

    await engage(store, projectId);
    expect(
      await getProjectDocumentContent(investor, projectId, documentId, blob, store),
    ).toMatchObject({ ok: true });
  });

  it("never lets a reader write, however entitled they are to read", async () => {
    const { store, projectId, documentId } = await registeredStore({
      disclosureClass: "investor_tier_1",
    });
    const blob = new InMemoryDocumentBlobClient();
    await engage(store, projectId);

    for (const viewer of [investor, owner]) {
      const attempt = await putProjectDocumentContent(
        viewer,
        projectId,
        documentId,
        REPORT,
        blob,
        store,
      );
      expect(attempt.ok).toBe(false);
      if (!attempt.ok) expect(attempt.failure.code).toBe("forbidden_role");
    }
  });
});

describe("project document routes", () => {
  beforeEach(() => {
    resetDocumentBlobClient();
  });
  afterEach(() => {
    resetDocumentBlobClient();
  });

  const url = "http://localhost/api/projects/x/documents/y/content";

  it("registers, stores and serves a report as an attachment", async () => {
    const { store, projectId } = await acceptedStore();

    const created = await handlePostProjectDocument(
      new Request("http://localhost/api/projects/x/documents", {
        method: "POST",
        body: JSON.stringify({
          original_filename: "site viability.pdf",
          content_type: "application/pdf",
          size_bytes: REPORT.byteLength,
          doc_type: "screening_report",
          disclosure_class: "investor_tier_1",
        }),
      }),
      operator,
      projectId,
      store,
    );
    expect(created.status).toBe(201);
    const documentId = ((await created.json()) as { id: string }).id;

    const put = await handlePutProjectDocumentContent(
      new Request(url, { method: "PUT", body: REPORT }),
      operator,
      projectId,
      documentId,
      store,
    );
    expect(put.status).toBe(200);

    const get = await handleGetProjectDocumentContent(operator, projectId, documentId, store);
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toBe("application/pdf");
    expect(get.headers.get("x-content-type-options")).toBe("nosniff");
    expect(get.headers.get("cache-control")).toBe("no-store");
    expect(get.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''site%20viability.pdf",
    );
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(REPORT);
  });

  it("rejects a path id that is not a uuid", async () => {
    const { store, projectId } = await registeredStore();
    expect(
      (await handleGetProjectDocumentContent(operator, projectId, "not-a-uuid", store)).status,
    ).toBe(400);
    expect(
      (await handleGetProjectDocumentContent(operator, "not-a-uuid", "not-a-uuid", store)).status,
    ).toBe(400);
  });

  it("returns 403 when a site owner tries to register a report", async () => {
    const { store, projectId } = await acceptedStore();
    const response = await handlePostProjectDocument(
      new Request("http://localhost/api/projects/x/documents", {
        method: "POST",
        body: JSON.stringify({
          original_filename: "underwriting.pdf",
          content_type: "application/pdf",
          size_bytes: REPORT.byteLength,
        }),
      }),
      owner,
      projectId,
      store,
    );
    expect(response.status).toBe(403);
  });

  it("rejects an unsupported content type at registration", async () => {
    const { store, projectId } = await acceptedStore();
    const response = await handlePostProjectDocument(
      new Request("http://localhost/api/projects/x/documents", {
        method: "POST",
        body: JSON.stringify({
          original_filename: "report.exe",
          content_type: "application/octet-stream",
          size_bytes: REPORT.byteLength,
        }),
      }),
      operator,
      projectId,
      store,
    );
    expect(response.status).toBe(400);
  });
});
