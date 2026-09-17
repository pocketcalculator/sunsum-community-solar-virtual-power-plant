import type { BlobServiceClient } from "@azure/storage-blob";
import { formatBlobPath, parseBlobPath, type DocumentBlobLocation } from "@/backend/core";

/**
 * The document blob seam.
 *
 * Mirrors `SUNSUM_STORE`: the in-memory client is the default so the demo, the
 * unit tests and a clean checkout all work with no Azure account and no
 * credentials, and `SUNSUM_BLOB=azure` swaps in the real one. `core` decides
 * where a blob lives (`core/documents/storage.ts`); this module only moves
 * bytes, so the layout cannot drift between the two implementations.
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
 * The account has `allowSharedKeyAccess=false`, so there is no connection
 * string and no account key to configure — access is Entra-only and the only
 * setting is which account to talk to. A missing account name throws rather
 * than falling back to the in-memory client, because a silent fallback means
 * uploads appear to succeed and then vanish.
 */
export class AzureDocumentBlobClient implements DocumentBlobClient {
  private readonly accountName: string;
  private serviceClient: Promise<BlobServiceClient> | null = null;

  constructor(accountName: string) {
    if (accountName.trim() === "") {
      throw new Error("AZURE_STORAGE_ACCOUNT_NAME is required when SUNSUM_BLOB=azure.");
    }
    this.accountName = accountName;
  }

  /**
   * The SDK is imported on first use rather than at module load, so the default
   * in-memory path never pulls it into the bundle or the test run. The
   * top-level import of `BlobServiceClient` is type-only and is erased at
   * compile time, so it does not undo that.
   */
  private client(): Promise<BlobServiceClient> {
    this.serviceClient ??= (async () => {
      const [{ BlobServiceClient }, identity] = await Promise.all([
        import("@azure/storage-blob"),
        import("@azure/identity"),
      ]);

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

      return new BlobServiceClient(`https://${this.accountName}.blob.core.windows.net`, credential);
    })();

    return this.serviceClient;
  }

  private async blob(location: DocumentBlobLocation) {
    const service = await this.client();
    return service.getContainerClient(location.container).getBlockBlobClient(location.blobName);
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

let configured: DocumentBlobClient | null = null;

export function documentBlobClient(): DocumentBlobClient {
  configured ??=
    process.env.SUNSUM_BLOB === "azure"
      ? new AzureDocumentBlobClient(process.env.AZURE_STORAGE_ACCOUNT_NAME ?? "")
      : new InMemoryDocumentBlobClient();

  return configured;
}

/** Test helper — drops the memoised client so the next call re-reads the env. */
export function resetDocumentBlobClient(): void {
  configured = null;
}
