// @vitest-environment node
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AZURITE_CONNECTION_STRING,
  AzureDocumentBlobClient,
  resetDocumentBlobClient,
} from "@/backend/blob";
import {
  addSiteDocument,
  buildDocumentBlobLocation,
  containerForDisclosure,
  siteDocumentParent,
} from "@/backend/core/documents";
import { parseBlobPath } from "@/backend/core";
import type { Viewer } from "@/backend/core/identity";
import { createSite } from "@/backend/core/sites";
import { createMemoryBackendStore } from "@/backend/core/store";
import {
  handleGetSiteDocumentContent,
  handlePutSiteDocumentContent,
} from "@/backend/handlers";

/**
 * The only test that talks to a real Blob Storage API.
 *
 * Everything else in the suite exercises `InMemoryDocumentBlobClient`, which
 * proves the layout but not the SDK calls built on top of it. Azurite serves
 * the same Blob REST API the deployed account does, so this is the one place
 * `AzureDocumentBlobClient` is genuinely executed rather than merely
 * constructed.
 *
 * It skips when the emulator is not running, so CI and a clean checkout stay
 * green. Start it with `npm run blob:up` and re-run to have these execute.
 */
const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 10000;

function emulatorIsRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: EMULATOR_HOST, port: EMULATOR_PORT });
    const settle = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

const running = await emulatorIsRunning();

function client() {
  return new AzureDocumentBlobClient({
    kind: "emulator",
    connectionString: AZURITE_CONNECTION_STRING,
  });
}

/**
 * Azurite keeps its state in `.azurite/` between runs, so a fixed id would
 * collide with the previous run and hide a broken upload behind an old blob.
 */
function location(disclosureClass: "owner_private" | "investor_tier_1", filename: string) {
  return buildDocumentBlobLocation({
    ownerUserId: randomUUID(),
    parent: siteDocumentParent(randomUUID()),
    documentId: randomUUID(),
    docType: "electricity_bill",
    originalFilename: filename,
    disclosureClass,
  });
}

describe.skipIf(!running)("AzureDocumentBlobClient against a live Azurite emulator", () => {
  /**
   * The client imports the SDK on first use, and Vite transforms it on the way
   * in — on a cold cache that alone outruns the default five-second timeout,
   * which then looks like a broken emulator rather than a slow import. Paying
   * it once here keeps the timeouts on the tests themselves meaningful;
   * creating a container is only tens of milliseconds by comparison.
   */
  beforeAll(async () => {
    await import("@azure/storage-blob");
  }, 120_000);

  it("round-trips bytes through the real SDK", async () => {
    const blob = client();
    const target = location("owner_private", "march-bill.pdf");
    const body = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

    expect(await blob.exists(target)).toBe(false);
    await blob.upload(target, body, "application/pdf");
    expect(await blob.exists(target)).toBe(true);
    expect(await blob.download(target)).toEqual(body);
  });

  it("returns null for a blob that was never uploaded", async () => {
    const blob = client();
    expect(await blob.download(location("owner_private", "absent.pdf"))).toBeNull();
  });

  /**
   * A fresh emulator has no containers at all. The real account has them from
   * `storage.bicep`, so this asserts the emulator-only bootstrap rather than a
   * behaviour the deployed client shares.
   */
  it("creates a missing container instead of failing the first upload", async () => {
    const blob = client();
    const target = location("investor_tier_1", "teaser.pdf");

    expect(target.container).toBe(containerForDisclosure("investor_tier_1"));
    await blob.upload(target, new Uint8Array([1, 2, 3]), "application/pdf");
    expect(await blob.exists(target)).toBe(true);
  });

  /**
   * The container split is the boundary underneath the application's own
   * authorization: a credential scoped to tier-1 cannot even name an
   * site-documents blob. This proves the two really are distinct containers on
   * the server, not just distinct strings in a path.
   */
  it("keeps the two disclosure classes in separate containers", async () => {
    const blob = client();
    const ownerOnly = location("owner_private", "bill.pdf");
    await blob.upload(ownerOnly, new Uint8Array([9]), "application/pdf");

    const sameNameInvestorSide = {
      container: containerForDisclosure("investor_tier_1"),
      blobName: ownerOnly.blobName,
    };

    expect(ownerOnly.container).toBe("site-documents");
    expect(sameNameInvestorSide.container).toBe("project-documents");
    expect(await blob.exists(ownerOnly)).toBe(true);
    expect(await blob.exists(sameNameInvestorSide)).toBe(false);
  });

  it("overwrites in place when the same blob is uploaded twice", async () => {
    const blob = client();
    const target = location("owner_private", "repeat.pdf");
    await blob.upload(target, new Uint8Array([1]), "application/pdf");
    await blob.upload(target, new Uint8Array([1, 2]), "application/pdf");
    expect(await blob.download(target)).toEqual(new Uint8Array([1, 2]));
  });
});

/**
 * The same journey a site owner takes, with Azurite behind it.
 *
 * The suite above proves the SDK calls; this proves the wiring — that the route
 * handlers reach `documentBlobClient()`, that it honours `SUNSUM_BLOB=azurite`,
 * and that the bytes land at the location the *record* names rather than
 * anywhere the request could have chosen. Reading them back through an
 * independent client closes that last gap: the assertion does not depend on the
 * same code path that wrote them.
 */
describe.skipIf(!running)("document content routes against a live Azurite emulator", () => {
  const owner: Viewer = { role: "site_owner", userId: randomUUID() };

  beforeAll(async () => {
    await import("@azure/storage-blob");
  }, 120_000);

  beforeEach(() => {
    process.env.SUNSUM_BLOB = "azurite";
    resetDocumentBlobClient();
  });

  afterEach(() => {
    delete process.env.SUNSUM_BLOB;
    resetDocumentBlobClient();
  });

  it("uploads and serves a document, and the bytes are really in the emulator", async () => {
    const store = createMemoryBackendStore();
    const created = await createSite(
      owner,
      {
        addressRaw: "148 Auburn Ave NE, Atlanta, GA 30303",
        siteType: "rooftop",
        ownershipStatus: "confirmed",
        approximateAreaSqm: 500,
        electricityUsageKwhAnnual: 12000,
        hasExistingSolar: false,
        consentGiven: true,
        submit: true,
      },
      store,
      {
        assess: () =>
          Promise.resolve({
            rulesetVersion: "integration-v1",
            inputsUsed: {},
            estimatedSystemSizeKwLow: 100,
            estimatedSystemSizeKwHigh: 140,
            estimatedAnnualGenerationKwhLow: 130000,
            estimatedAnnualGenerationKwhHigh: 180000,
            preliminaryProjectType: "community_rooftop",
            viabilityStatus: "potentially_viable",
            flags: [],
            missingInformation: [],
          }),
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const siteId = created.value.site.id;

    const body = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const registered = await addSiteDocument(
      owner,
      siteId,
      {
        originalFilename: "march-bill.pdf",
        contentType: "application/pdf",
        sizeBytes: body.byteLength,
        docType: "electricity_bill",
        disclosureClass: "owner_private",
      },
      store,
    );
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;

    const put = await handlePutSiteDocumentContent(
      new Request("http://localhost/content", { method: "PUT", body }),
      owner,
      siteId,
      registered.value.id,
      store,
    );
    expect(put.status).toBe(200);

    const get = await handleGetSiteDocumentContent(owner, siteId, registered.value.id, store);
    expect(get.status).toBe(200);
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(body);

    const [record] = await store.listDocuments(siteId, null);
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.blobPath).toContain(`owners/${owner.userId}/sites/${siteId}/`);

    const target = parseBlobPath(record.blobPath);
    expect(target).not.toBeNull();
    if (target === null) return;
    expect(await client().download(target)).toEqual(body);
  });
});
