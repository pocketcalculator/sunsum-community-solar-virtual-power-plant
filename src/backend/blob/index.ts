import type { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { formatBlobPath, parseBlobPath, type DocumentBlobLocation } from "@/backend/core";

/**
 * The document blob seam.
 *
 * Mirrors `SUNSUM_STORE`: the in-memory client is the default so the demo, the
 * unit tests and a clean checkout all work with no Azure account and no
 * credentials, `SUNSUM_BLOB=azurite` points the real SDK at a local emulator,
 * and `SUNSUM_BLOB=azure` points it at the deployed account. `core` decides
 * where a blob lives (`core/documents/storage.ts`); this module only moves
 * bytes, so the layout cannot drift between implementations.
 */
export interface DocumentBlobClient {
  upload(location: DocumentBlobLocation, body: Uint8Array, contentType: string): Promise<void>;
  download(location: DocumentBlobLocation): Promise<Uint8Array | null>;
  exists(location: DocumentBlobLocation): Promise<boolean>;
}

export class InMemoryDocumentBlobClient implements DocumentBlobClient {
  private readonly blobs = new Map<string, { body: Uint8Array; contentType: string }>();

  async upload(
    location: DocumentBlobLocation,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    this.blobs.set(formatBlobPath(location), { body, contentType });
  }

  async download(location: DocumentBlobLocation): Promise<Uint8Array | null> {
    return this.blobs.get(formatBlobPath(location))?.body ?? null;
  }

  async exists(location: DocumentBlobLocation): Promise<boolean> {
    return this.blobs.has(formatBlobPath(location));
  }

  /** Test helper — how many blobs are held in one container. */
  countByContainer(container: string): number {
    let count = 0;
    for (const key of this.blobs.keys()) {
      if (parseBlobPath(key)?.container === container) count += 1;
    }
    return count;
  }
}

/**
 * The published Azurite development credential. It is the same fixed string in
 * every Azurite installation and reaches nothing but a local emulator, so it
 * lives in the repository for the same reason the Postgres development
 * password does: there is nothing here worth protecting, and a value nobody
 * can find is a value that stops the demo.
 */
export const AZURITE_CONNECTION_STRING =
  "DefaultEndpointsProtocol=http;" +
  "AccountName=devstoreaccount1;" +
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
  "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";

/**
 * How to reach a real Blob Storage API.
 *
 * The deployed account has `allowSharedKeyAccess=false`, so it is Entra-only
 * and the sole setting is which account to talk to. Azurite is the opposite:
 * it authenticates with a shared key and has no tenant behind it. Splitting
 * them into two variants of one client means the emulator drives the same SDK
 * calls as production — a local path that ran different code would prove
 * nothing about the deployed one — while keeping the credentials from ever
 * meeting: the `entra` branch cannot read a connection string even by
 * accident, so no configuration mistake can put a key in front of the real
 * account.
 */
export type AzureBlobConnection =
  | { readonly kind: "entra"; readonly accountName: string }
  | { readonly kind: "emulator"; readonly connectionString: string };

export class AzureDocumentBlobClient implements DocumentBlobClient {
  private readonly connection: AzureBlobConnection;
  private serviceClient: Promise<BlobServiceClient> | null = null;
  private readonly ensuredContainers = new Set<string>();

  constructor(connection: AzureBlobConnection) {
    if (connection.kind === "entra" && connection.accountName.trim() === "") {
      throw new Error("AZURE_STORAGE_ACCOUNT_NAME is required when SUNSUM_BLOB=azure.");
    }
    if (connection.kind === "emulator" && connection.connectionString.trim() === "") {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING is empty; unset it to use the default.");
    }
    this.connection = connection;
  }

  /**
   * The SDK is imported on first use rather than at module load, so the default
   * in-memory path never pulls it into the bundle or the test run. The
   * top-level imports are type-only and are erased at compile time, so they do
   * not undo that.
   */
  private client(): Promise<BlobServiceClient> {
    this.serviceClient ??= (async () => {
      const { BlobServiceClient } = await import("@azure/storage-blob");

      if (this.connection.kind === "emulator") {
        return BlobServiceClient.fromConnectionString(this.connection.connectionString);
      }

      const identity = await import("@azure/identity");

      /**
       * `DefaultAzureCredential` walks a chain of sources that should not exist
       * in a deployed app, so it is reserved for local development where it
       * picks up `az login`. Anything else uses the managed identity directly.
       */
      const credential =
        process.env.NODE_ENV === "development"
          ? new identity.DefaultAzureCredential()
          : process.env.AZURE_CLIENT_ID
            ? new identity.ManagedIdentityCredential(process.env.AZURE_CLIENT_ID)
            : new identity.ManagedIdentityCredential();

      return new BlobServiceClient(
        `https://${this.connection.accountName}.blob.core.windows.net`,
        credential,
      );
    })();

    return this.serviceClient;
  }

  /**
   * A fresh emulator starts with no containers, whereas the real account has
   * them provisioned by `storage.bicep`. Creating them is therefore emulator-
   * only and deliberately not a general fallback: the deployed application is
   * not meant to hold container-create rights, and a client that quietly
   * created a missing container in Azure would hide the very misconfiguration
   * it should surface.
   */
  private async container(name: string): Promise<ContainerClient> {
    const service = await this.client();
    const container = service.getContainerClient(name);

    if (this.connection.kind === "emulator" && !this.ensuredContainers.has(name)) {
      await container.createIfNotExists();
      this.ensuredContainers.add(name);
    }

    return container;
  }

  private async blob(location: DocumentBlobLocation) {
    const container = await this.container(location.container);
    return container.getBlockBlobClient(location.blobName);
  }

  async upload(
    location: DocumentBlobLocation,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    const blob = await this.blob(location);
    await blob.uploadData(body, { blobHTTPHeaders: { blobContentType: contentType } });
  }

  async download(location: DocumentBlobLocation): Promise<Uint8Array | null> {
    const blob = await this.blob(location);
    if (!(await blob.exists())) return null;
    return new Uint8Array(await blob.downloadToBuffer());
  }

  async exists(location: DocumentBlobLocation): Promise<boolean> {
    const blob = await this.blob(location);
    return blob.exists();
  }
}

export const BLOB_MODES = ["memory", "azurite", "azure"] as const;
export type BlobMode = (typeof BLOB_MODES)[number];

export function isBlobMode(value: string): value is BlobMode {
  return BLOB_MODES.some((mode) => mode === value);
}

function createClient(mode: BlobMode): DocumentBlobClient {
  switch (mode) {
    case "memory":
      return new InMemoryDocumentBlobClient();
    case "azurite":
      return new AzureDocumentBlobClient({
        kind: "emulator",
        connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ?? AZURITE_CONNECTION_STRING,
      });
    case "azure":
      return new AzureDocumentBlobClient({
        kind: "entra",
        accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME ?? "",
      });
  }
}

let configured: DocumentBlobClient | null = null;

export function documentBlobClient(): DocumentBlobClient {
  if (configured === null) {
    const mode = process.env.SUNSUM_BLOB ?? "memory";

    /**
     * An unrecognised value throws rather than quietly falling back to memory.
     * A typo in `SUNSUM_BLOB` would otherwise look exactly like a working
     * deployment whose uploads vanish on restart, which is the failure this
     * seam exists to make impossible.
     */
    if (!isBlobMode(mode)) {
      throw new Error(
        `SUNSUM_BLOB must be one of ${BLOB_MODES.join(", ")}; received ${JSON.stringify(mode)}.`,
      );
    }

    configured = createClient(mode);
  }

  return configured;
}

/** Test helper — drops the memoised client so the next call re-reads the env. */
export function resetDocumentBlobClient(): void {
  configured = null;
}
