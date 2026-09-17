// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  AzureDocumentBlobClient,
  documentBlobClient,
  InMemoryDocumentBlobClient,
  resetDocumentBlobClient,
} from "@/backend/blob";
import {
  addSiteDocument,
  buildDocumentBlobLocation,
  parseBlobPath,
} from "@/backend/core/documents";
import type { Viewer } from "@/backend/core/identity";
import { createSite, type SiteCreateInput, type ViabilityClient } from "@/backend/core/sites";
import { createMemoryBackendStore } from "@/backend/core/store";

const owner: Viewer = {
  role: "site_owner",
  userId: "cd865e91-942b-48d3-a6f1-7b2053e4c890",
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

afterEach(() => {
  resetDocumentBlobClient();
  delete process.env.SUNSUM_BLOB;
  delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
});

describe("document blob client seam", () => {
  it("defaults to the in-memory client so a clean checkout needs no Azure", () => {
    expect(documentBlobClient()).toBeInstanceOf(InMemoryDocumentBlobClient);
  });

  it("selects the Azure client only when asked", () => {
    process.env.SUNSUM_BLOB = "azure";
    process.env.AZURE_STORAGE_ACCOUNT_NAME = "stsunsumsolardevcus";
    expect(documentBlobClient()).toBeInstanceOf(AzureDocumentBlobClient);
  });

  /**
   * Falling back to the in-memory client here would mean uploads appear to
   * succeed in a deployed environment and then quietly disappear, which is a
   * worse failure than refusing to start.
   */
  it("refuses to start in azure mode with no account name", () => {
    process.env.SUNSUM_BLOB = "azure";
    expect(() => documentBlobClient()).toThrow(/AZURE_STORAGE_ACCOUNT_NAME/);
  });

  it("round-trips bytes through the in-memory client", async () => {
    const client = new InMemoryDocumentBlobClient();
    const location = buildDocumentBlobLocation({
      parent: { kind: "site", id: "site-1" },
      documentId: "doc-1",
      docType: "electricity_bill",
      originalFilename: "bill.pdf",
      disclosureClass: "owner_private",
    });

    expect(await client.exists(location)).toBe(false);
    await client.upload(location, new Uint8Array([1, 2, 3]), "application/pdf");
    expect(await client.exists(location)).toBe(true);
    expect(await client.download(location)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns null rather than throwing for a blob that was never uploaded", async () => {
    const client = new InMemoryDocumentBlobClient();
    const location = buildDocumentBlobLocation({
      parent: { kind: "site", id: "site-1" },
      documentId: "missing",
      docType: "other",
      originalFilename: "nope.pdf",
      disclosureClass: "owner_private",
    });
    expect(await client.download(location)).toBeNull();
  });

  it("keeps an owner-private upload out of the investor container", async () => {
    const client = new InMemoryDocumentBlobClient();
    await client.upload(
      buildDocumentBlobLocation({
        parent: { kind: "site", id: "site-1" },
        documentId: "doc-1",
        docType: "electricity_bill",
        originalFilename: "bill.pdf",
        disclosureClass: "owner_private",
      }),
      new Uint8Array([1]),
      "application/pdf",
    );

    expect(client.countByContainer("owner-private")).toBe(1);
    expect(client.countByContainer("investor-tier-1")).toBe(0);
  });
});

describe("uploaded documents carry a real blob path", () => {
  it("no longer writes the placeholder path", async () => {
    const { store, siteId } = await submittedStore();

    const result = await addSiteDocument(
      owner,
      siteId,
      {
        originalFilename: "march-bill.pdf",
        contentType: "application/pdf",
        sizeBytes: 2048,
        docType: "electricity_bill",
        disclosureClass: "owner_private",
      },
      store,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = (await store.listDocuments(siteId, null)).find(
      (document) => document.id === result.value.id,
    );
    expect(stored).toBeDefined();
    expect(stored!.blobPath.startsWith("placeholder/")).toBe(false);

    const location = parseBlobPath(stored!.blobPath);
    expect(location).not.toBeNull();
    expect(location!.container).toBe("owner-private");
    expect(location!.blobName).toContain(`sites/${siteId}/electricity_bill/`);
  });

  /**
   * `documents.doc_type` is `text NOT NULL` with no column default, so an
   * upload that omitted it used to build a record PostgreSQL would reject. A
   * column default does not apply to an explicitly inserted NULL.
   */
  it("never stores a null doc type when the request omits one", async () => {
    const { store, siteId } = await submittedStore();

    const result = await addSiteDocument(
      owner,
      siteId,
      {
        originalFilename: "photo.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1024,
        docType: null,
        disclosureClass: "owner_private",
      },
      store,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stored = (await store.listDocuments(siteId, null)).find(
      (document) => document.id === result.value.id,
    );
    expect(stored!.docType).toBe("other");
  });

  it("gives two uploads of the same filename distinct blob names", async () => {
    const { store, siteId } = await submittedStore();
    const upload = () =>
      addSiteDocument(
        owner,
        siteId,
        {
          originalFilename: "bill.pdf",
          contentType: "application/pdf",
          sizeBytes: 100,
          docType: "electricity_bill",
          disclosureClass: "owner_private",
        },
        store,
      );

    const first = await upload();
    const second = await upload();
    expect(first.ok && second.ok).toBe(true);

    const paths = (await store.listDocuments(siteId, null)).map((document) => document.blobPath);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
