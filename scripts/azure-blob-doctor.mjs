#!/usr/bin/env node
/**
 * Read-only diagnosis of why the deployed blob storage is or is not reachable.
 *
 *   node scripts/azure-blob-doctor.mjs
 *
 * Working out that the data plane was unreachable, and which of two independent
 * blockers was responsible, took a long sequence of `az` calls whose results
 * only make sense together. The expensive part was not running them — it was
 * knowing that the storage update returns HTTP 200 while silently doing
 * nothing, and that while the network refuses a request a correct role
 * assignment and a missing one look identical. This encodes both.
 *
 * Every call here reads. Nothing is created, updated or deleted, so it is safe
 * to run against the shared dev subscription at any time.
 */

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** The dev environment this repository provisions. */
export const TARGET = {
  subscriptionId: "f941228c-d6df-4b2f-93e0-2221773d2ba1",
  resourceGroup: "rg-sunsum-solar-dev-centralus",
  storageAccount: "stsunsumsolardevcus",
  appService: "app-sunsum-smoke-928e5e28",
  appServicePlan: "asp-sunsum-smoke-free",
};

/**
 * Roles that actually grant blob data access.
 *
 * Owner and Contributor are deliberately absent. They carry control-plane
 * permissions and no `dataActions`, so a subscription Owner can create and
 * delete the account but cannot read a blob inside it until one of these is
 * assigned. That surprises people often enough to be worth naming here.
 */
export const BLOB_DATA_ROLES = [
  "Storage Blob Data Owner",
  "Storage Blob Data Contributor",
  "Storage Blob Data Reader",
];

/** App Service tiers that cannot do regional VNet integration at any size. */
const TIERS_WITHOUT_VNET_INTEGRATION = ["Free", "Shared"];

/**
 * Turns observed facts into an ordered list of blockers.
 *
 * Pure, and exported, so the decision table is unit-tested rather than only
 * exercised when someone happens to run this against Azure.
 */
export function diagnose(observed) {
  const blockers = [];

  const privateEndpointCount = observed.privateEndpoints?.length ?? 0;
  const networkBlocked =
    observed.publicNetworkAccess === "Disabled" && privateEndpointCount === 0;

  if (networkBlocked) {
    blockers.push({
      id: "network",
      title: "The data plane is unreachable at the network layer",
      detail:
        "publicNetworkAccess is Disabled and no private endpoint exists, so a request to " +
        "the blob endpoint is refused before any token is evaluated. Setting the property " +
        "back to Enabled returns HTTP 200 and does nothing: a modify-effect policy rewrites " +
        "it on every write.",
      fix: "infrastructure/docs/policy-exemption-request.md — grant an exemption, or deploy main.bicep with enablePrivateBlobAccess=true.",
    });
  }

  const hasDataRole = (observed.roleAssignments ?? []).some((assignment) =>
    BLOB_DATA_ROLES.includes(assignment.roleDefinitionName),
  );

  /*
   * Undefined means the lookup could not run — a blocked Graph call, or no
   * signed-in user — which is not the same as finding no assignment. Reporting
   * a missing role on the strength of a failed query would send the next person
   * to ask for a grant they may already have.
   */
  if (observed.roleAssignments === undefined) {
    blockers.push({
      id: "rbac-unknown",
      title: "Could not check the data-plane role assignment",
      detail:
        "The signed-in principal could not be resolved, so role assignments on the account " +
        "were never queried. This is a gap in the diagnosis, not a finding.",
      fix: "az login, then re-run. If Entra lookups are blocked, check the assignment in the portal.",
    });
  } else if (!hasDataRole) {
    blockers.push({
      id: "rbac",
      title: "No data-plane role assignment",
      detail:
        `None of ${BLOB_DATA_ROLES.join(", ")} is assigned on the account. ` +
        "Control-plane Owner or Contributor does not grant blob access." +
        /*
         * Said explicitly because it changes what the next person should do:
         * granting the role while the network still refuses produces no
         * observable change, which reads like the grant failed.
         */
        (networkBlocked
          ? " This cannot be confirmed while the network blocker above is active — the " +
            "request never reaches authorization, so a correct assignment and a missing " +
            "one are indistinguishable. Fix the network first."
          : ""),
      fix: 'az role assignment create --role "Storage Blob Data Contributor" --scope <account id> --assignee <objectId>',
    });
  }

  if (privateEndpointCount > 0 && !observed.appServiceVnetSubnetId) {
    blockers.push({
      id: "app-not-integrated",
      title: "A private endpoint exists but the App Service is not in the VNet",
      detail:
        "The endpoint is only reachable from inside the virtual network. Without regional " +
        "VNet integration the deployed application still resolves the public endpoint, " +
        "which the policy refuses.",
      fix: "Deploy main.bicep with enablePrivateBlobAccess=true.",
    });
  }

  if (
    observed.appServicePlanTier &&
    TIERS_WITHOUT_VNET_INTEGRATION.includes(observed.appServicePlanTier) &&
    networkBlocked
  ) {
    blockers.push({
      id: "plan-tier",
      title: `The App Service plan is ${observed.appServicePlanTier} tier`,
      detail:
        "Regional VNet integration does not exist below Basic, so the private-endpoint " +
        "route needs the plan raised before it can work. Only relevant if an exemption " +
        "is not granted.",
      fix: "Deploy main.bicep with enablePrivateBlobAccess=true, which moves the plan to B1.",
    });
  }

  if (observed.appServiceHasIdentity === false) {
    blockers.push({
      id: "no-identity",
      title: "The App Service has no managed identity",
      detail:
        "There is no principal to grant the data-plane role to, so the deployed application " +
        "cannot authenticate to storage even once the network allows it.",
      fix: `az webapp identity assign --name ${TARGET.appService} --resource-group ${TARGET.resourceGroup}`,
    });
  }

  return { reachable: blockers.length === 0, blockers };
}

/**
 * `az ... -o json`, returning undefined rather than throwing when a call fails.
 *
 * Every ARM call is pinned to the target subscription. The active subscription
 * is shared, mutable machine state — another terminal running `az account set`
 * silently redirects an unpinned call, and the failure surfaces as "could not
 * read the account", which reads like an outage rather than a context change.
 */
function az(args) {
  const result = spawnSync("az", [...args, "--subscription", TARGET.subscriptionId, "-o", "json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

/** `az` calls that are not subscription-scoped, such as directory lookups. */
function azUnscoped(args) {
  const result = spawnSync("az", [...args, "-o", "json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

/**
 * The object id of the signed-in user, but only when the CLI is pointed at the
 * tenant that owns the target subscription.
 *
 * `az ad signed-in-user show` resolves against the *active* tenant, and the
 * same person has a different object id in each one. Using an id from the wrong
 * tenant would return an empty assignment list and be reported as a missing
 * role, sending the next person to request a grant they may already hold.
 */
function signedInPrincipal() {
  const active = azUnscoped(["account", "show", "--query", "tenantId"]);
  const target = azUnscoped([
    "account",
    "list",
    "--query",
    `[?id=='${TARGET.subscriptionId}'].tenantId | [0]`,
  ]);

  if (!active || !target || active !== target) {
    return undefined;
  }

  return azUnscoped(["ad", "signed-in-user", "show", "--query", "id"]);
}

/** Reads the current state of everything `diagnose` needs. */
function observe() {
  const account = az([
    "storage",
    "account",
    "show",
    "--name",
    TARGET.storageAccount,
    "--resource-group",
    TARGET.resourceGroup,
    "--query",
    "{publicNetworkAccess:publicNetworkAccess,allowSharedKeyAccess:allowSharedKeyAccess,allowBlobPublicAccess:allowBlobPublicAccess,id:id}",
  ]);

  if (!account) {
    return undefined;
  }

  const principalId = signedInPrincipal();

  return {
    ...account,
    privateEndpoints:
      az([
        "network",
        "private-endpoint",
        "list",
        "--resource-group",
        TARGET.resourceGroup,
        "--query",
        "[].name",
      ]) ?? [],
    roleAssignments: principalId
      ? (az([
          "role",
          "assignment",
          "list",
          "--assignee",
          principalId,
          "--scope",
          account.id,
          "--include-inherited",
          "--query",
          "[].{roleDefinitionName:roleDefinitionName,scope:scope}",
        ]) ?? [])
      : undefined,
    appServicePlanTier: az([
      "appservice",
      "plan",
      "show",
      "--name",
      TARGET.appServicePlan,
      "--resource-group",
      TARGET.resourceGroup,
      "--query",
      "sku.tier",
    ]),
    appServiceHasIdentity: Boolean(
      az([
        "webapp",
        "show",
        "--name",
        TARGET.appService,
        "--resource-group",
        TARGET.resourceGroup,
        "--query",
        "identity",
      ]),
    ),
    appServiceVnetSubnetId: az([
      "webapp",
      "show",
      "--name",
      TARGET.appService,
      "--resource-group",
      TARGET.resourceGroup,
      "--query",
      "virtualNetworkSubnetId",
    ]),
  };
}

function report(observed) {
  const { reachable, blockers } = diagnose(observed);

  console.log(`Account   ${TARGET.storageAccount}`);
  console.log(`Group     ${TARGET.resourceGroup}`);
  console.log("");
  console.log(`  publicNetworkAccess   ${observed.publicNetworkAccess}`);
  console.log(`  allowSharedKeyAccess  ${observed.allowSharedKeyAccess}`);
  console.log(`  allowBlobPublicAccess ${observed.allowBlobPublicAccess}`);
  console.log(`  private endpoints     ${observed.privateEndpoints.length}`);
  console.log(`  App Service plan      ${observed.appServicePlanTier ?? "unknown"}`);
  console.log(`  App Service identity  ${observed.appServiceHasIdentity ? "yes" : "none"}`);
  console.log(`  App Service in VNet   ${observed.appServiceVnetSubnetId ? "yes" : "no"}`);
  console.log("");

  if (reachable) {
    console.log("No blockers found. SUNSUM_BLOB=azure should work.");
    return 0;
  }

  console.log(`${blockers.length} blocker(s), in the order they must be fixed:\n`);

  blockers.forEach((blocker, index) => {
    console.log(`${index + 1}. ${blocker.title}`);
    console.log(`   ${blocker.detail}`);
    console.log(`   Fix: ${blocker.fix}\n`);
  });

  console.log("Until these clear, SUNSUM_BLOB must stay `memory` or `azurite`.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const observed = observe();

  if (!observed) {
    console.error(
      `Could not read ${TARGET.storageAccount} in ${TARGET.resourceGroup}.\n\n` +
        "Every call is pinned to the target subscription, so this is not the active-subscription\n" +
        "problem it might look like. Check that the Azure CLI is signed in to the tenant that\n" +
        `owns ${TARGET.subscriptionId}, and that the account still exists:\n\n` +
        "  az login\n" +
        `  az account list --query "[?id=='${TARGET.subscriptionId}']" -o table`,
    );
    process.exit(1);
  }

  process.exit(report(observed));
}
