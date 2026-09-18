// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Viewer } from "@/backend/core/identity";
import { createSite, type SiteCreateInput, type ViabilityClient } from "@/backend/core/sites";
import { createMemoryBackendStore } from "@/backend/core/store";
import {
  addSiteDocument,
  getSiteDocumentContent,
  putSiteDocumentContent,
} from "@/backend/core/documents";
import { formatBlobPath, parseBlobPath } from "@/backend/core";
import {
  InMemoryDocumentBlobClient,
  documentBlobClient,
  resetDocumentBlobClient,
} from "@/backend/blob";
import {
  handleGetSiteDocumentContent,
  handlePutSiteDocumentContent,
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

const BILL = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

/** A site with one registered `owner_private` document whose size matches BILL. */
async function registeredStore(filename = "bill.pdf") {
  const store = createMemoryBackendStore();
  const created = await createSite(owner, completeSite, store, viability);
  if (!created.ok) throw new Error(created.failure.code);
  const siteId = created.value.site.id;
  const added = await addSiteDocument(
    owner,
    siteId,
    {
      originalFilename: filename,
      contentType: "application/pdf",
      sizeBytes: BILL.byteLength,
      docType: "electricity_bill",
      disclosureClass: "owner_private",
    },
    store,
  );
  if (!added.ok) throw new Error(added.failure.code);
  return { store, siteId, documentId: added.value.id };
}

describe("document content", () => {
  it("round-trips bytes and serves the type and filename from the record", async () => {
    const { store, siteId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();

    const uploaded = await putSiteDocumentContent(owner, siteId, documentId, BILL, blob, store);
    expect(uploaded.ok).toBe(true);
    if (uploaded.ok) expect(uploaded.value.id).toBe(documentId);

    const read = await getSiteDocumentContent(owner, siteId, documentId, blob, store);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(Array.from(read.value.content)).toEqual(Array.from(BILL));
    expect(read.value.contentType).toBe("application/pdf");
    expect(read.value.originalFilename).toBe("bill.pdf");
  });

  it("writes to the path held on the record, under the owner prefix", async () => {
    const { store, siteId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();
    await putSiteDocumentContent(owner, siteId, documentId, BILL, blob, store);

    const [record] = await store.listDocuments(siteId, null);
    expect(record).toBeDefined();
    if (record === undefined) return;
    const location = parseBlobPath(record.blobPath);
    expect(location).not.toBeNull();
    if (location === null) return;

    expect(await blob.exists(location)).toBe(true);
    expect(blob.countByContainer("owner-private")).toBe(1);
    expect(blob.countByContainer("investor-tier-1")).toBe(0);
    expect(formatBlobPath(location)).toContain(`owners/${owner.userId}/sites/${siteId}/`);
  });

  it("reports not_found when nothing was uploaded, which is a normal state", async () => {
    const { store, siteId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();
    const read = await getSiteDocumentContent(owner, siteId, documentId, blob, store);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.failure.code).toBe("not_found");
  });

  it("rejects bytes that disagree with the registered size", async () => {
    const { store, siteId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();
    const mismatch = await putSiteDocumentContent(
      owner,
      siteId,
      documentId,
      new Uint8Array([1, 2, 3, 4, 5]),
      blob,
      store,
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.failure.code).toBe("invalid_body");
      expect(mismatch.failure.details).toMatchObject({
        expected_size_bytes: BILL.byteLength,
        received_size_bytes: 5,
      });
    }
    // Nothing was written, so a later read still reports "not uploaded".
    const read = await getSiteDocumentContent(owner, siteId, documentId, blob, store);
    expect(read.ok).toBe(false);
  });

  it("rejects an empty body", async () => {
    const { store, siteId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();
    const empty = await putSiteDocumentContent(
      owner,
      siteId,
      documentId,
      new Uint8Array(0),
      blob,
      store,
    );
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.failure.code).toBe("invalid_body");
  });

  it("refuses another owner and refuses an investor outright", async () => {
    const { store, siteId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();

    const foreignPut = await putSiteDocumentContent(
      otherOwner,
      siteId,
      documentId,
      BILL,
      blob,
      store,
    );
    expect(foreignPut.ok).toBe(false);
    if (!foreignPut.ok) expect(foreignPut.failure.code).toBe("forbidden_owner");

    const foreignGet = await getSiteDocumentContent(otherOwner, siteId, documentId, blob, store);
    expect(foreignGet.ok).toBe(false);
    if (!foreignGet.ok) expect(foreignGet.failure.code).toBe("forbidden_owner");

    const investorGet = await getSiteDocumentContent(investor, siteId, documentId, blob, store);
    expect(investorGet.ok).toBe(false);
    if (!investorGet.ok) expect(investorGet.failure.code).toBe("forbidden_role");
  });

  it("lets an operator read an owner's document", async () => {
    const { store, siteId, documentId } = await registeredStore();
    const blob = new InMemoryDocumentBlobClient();
    await putSiteDocumentContent(owner, siteId, documentId, BILL, blob, store);
    const read = await getSiteDocumentContent(operator, siteId, documentId, blob, store);
    expect(read.ok).toBe(true);
  });

  it("does not resolve a document id belonging to a different site", async () => {
    const { store, siteId, documentId } = await registeredStore();
    const second = await createSite(owner, completeSite, store, viability);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const blob = new InMemoryDocumentBlobClient();
    await putSiteDocumentContent(owner, siteId, documentId, BILL, blob, store);

    // Same owner, same real document id, wrong site: the record must not resolve.
    const crossed = await getSiteDocumentContent(
      owner,
      second.value.site.id,
      documentId,
      blob,
      store,
    );
    expect(crossed.ok).toBe(false);
    if (!crossed.ok) expect(crossed.failure.code).toBe("not_found");
    // Against its own site the identical call succeeds, so the id is not at fault.
    expect(await getSiteDocumentContent(owner, siteId, documentId, blob, store)).toMatchObject({
      ok: true,
    });
  });
});

describe("document content routes", () => {
  beforeEach(() => {
    resetDocumentBlobClient();
  });
  afterEach(() => {
    resetDocumentBlobClient();
  });

  const url = "http://localhost/api/sites/x/documents/y/content";

  it("stores an uploaded body and serves it back as an attachment", async () => {
    const { store, siteId, documentId } = await registeredStore("summer bill.pdf");

    const put = await handlePutSiteDocumentContent(
      new Request(url, { method: "PUT", body: BILL }),
      owner,
      siteId,
      documentId,
      store,
    );
    expect(put.status).toBe(200);

    const get = await handleGetSiteDocumentContent(owner, siteId, documentId, store);
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toBe("application/pdf");
    expect(get.headers.get("x-content-type-options")).toBe("nosniff");
    expect(get.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''summer%20bill.pdf",
    );
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(BILL);
  });

  it("ignores the request content type in favour of the registered one", async () => {
    const { store, siteId, documentId } = await registeredStore();
    await handlePutSiteDocumentContent(
      new Request(url, {
        method: "PUT",
        body: BILL,
        headers: { "content-type": "image/svg+xml" },
      }),
      owner,
      siteId,
      documentId,
      store,
    );
    const get = await handleGetSiteDocumentContent(owner, siteId, documentId, store);
    expect(get.headers.get("content-type")).toBe("application/pdf");
  });

  it("returns 404 before an upload and 403 for another owner", async () => {
    const { store, siteId, documentId } = await registeredStore();
    expect((await handleGetSiteDocumentContent(owner, siteId, documentId, store)).status).toBe(404);
    expect(
      (await handleGetSiteDocumentContent(otherOwner, siteId, documentId, store)).status,
    ).toBe(403);
  });

  it("rejects a path id that is not a uuid", async () => {
    const { store, siteId } = await registeredStore();
    const response = await handleGetSiteDocumentContent(owner, siteId, "not-a-uuid", store);
    expect(response.status).toBe(400);
  });

  it("memoises one client so a route upload is visible to a route download", () => {
    expect(documentBlobClient()).toBe(documentBlobClient());
  });
});
