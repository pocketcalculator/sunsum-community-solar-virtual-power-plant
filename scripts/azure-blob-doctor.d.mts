/**
 * Types for the pure helpers in `azure-blob-doctor.mjs`.
 *
 * Hand-written for the same reason as `blob.d.mts`: the script is plain `.mjs`
 * run straight by Node with no build step, and `allowJs` is off. Only the
 * exports the test needs are declared — the `az`-invoking parts are not, because
 * nothing type checked calls them.
 */

export interface RoleAssignment {
  readonly roleDefinitionName: string;
  readonly scope?: string;
}

/** What `diagnose` needs to know. Fields are optional so a test can state only what it means to assert. */
export interface BlobAccessObservations {
  readonly publicNetworkAccess?: string;
  readonly allowSharedKeyAccess?: boolean;
  readonly allowBlobPublicAccess?: boolean;
  readonly privateEndpoints?: readonly string[];
  /** `undefined` means the lookup could not run, which is distinct from an empty list. */
  readonly roleAssignments?: readonly RoleAssignment[] | undefined;
  readonly appServicePlanTier?: string | undefined;
  readonly appServiceHasIdentity?: boolean;
  readonly appServiceVnetSubnetId?: string | null | undefined;
}

export interface Blocker {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly fix: string;
}

export interface Diagnosis {
  readonly reachable: boolean;
  readonly blockers: readonly Blocker[];
}

export function diagnose(observed: BlobAccessObservations): Diagnosis;

export const BLOB_DATA_ROLES: readonly string[];

export const TARGET: {
  readonly subscriptionId: string;
  readonly resourceGroup: string;
  readonly storageAccount: string;
  readonly appService: string;
  readonly appServicePlan: string;
};
