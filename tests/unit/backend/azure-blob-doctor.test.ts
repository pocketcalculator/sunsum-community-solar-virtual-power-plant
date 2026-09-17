// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BLOB_DATA_ROLES,
  diagnose,
  type BlobAccessObservations,
} from "../../../scripts/azure-blob-doctor.mjs";

/**
 * The decision table behind `npm run blob:doctor`.
 *
 * Two of these encode findings that cost real time to establish against the
 * live subscription — that a control-plane Owner still cannot read a blob, and
 * that while the network refuses a request an RBAC grant is unverifiable — so
 * they are pinned here rather than left as prose in a document.
 */

/** The live dev environment as observed on 2026-09-17. */
const LIVE: BlobAccessObservations = {
  publicNetworkAccess: "Disabled",
  allowSharedKeyAccess: false,
  allowBlobPublicAccess: false,
  privateEndpoints: [],
  roleAssignments: [],
  appServicePlanTier: "Free",
  appServiceHasIdentity: false,
  appServiceVnetSubnetId: null,
};

/** Everything cleared: public access on, role granted, app ready. */
const HEALTHY: BlobAccessObservations = {
  publicNetworkAccess: "Enabled",
  privateEndpoints: [],
  roleAssignments: [{ roleDefinitionName: "Storage Blob Data Contributor" }],
  appServicePlanTier: "Basic",
  appServiceHasIdentity: true,
  appServiceVnetSubnetId: null,
};

const ids = (observed: BlobAccessObservations) =>
  diagnose(observed).blockers.map((blocker) => blocker.id);

describe("diagnosing blob reachability", () => {
  it("reports every blocker present in the live environment", () => {
    expect(ids(LIVE)).toEqual(["network", "rbac", "plan-tier", "no-identity"]);
    expect(diagnose(LIVE).reachable).toBe(false);
  });

  it("puts the network blocker first, because the others cannot be verified behind it", () => {
    expect(ids(LIVE)[0]).toBe("network");
  });

  it("finds nothing to report once every blocker is cleared", () => {
    expect(diagnose(HEALTHY)).toEqual({ reachable: true, blockers: [] });
  });
});

describe("the network blocker", () => {
  it("is raised when access is disabled and no private endpoint exists", () => {
    expect(ids(LIVE)).toContain("network");
  });

  /** A private endpoint is the supported route in; disabled public access is then expected. */
  it("is cleared by a private endpoint, even with public access still disabled", () => {
    const withEndpoint = { ...HEALTHY, publicNetworkAccess: "Disabled", privateEndpoints: ["pe"] };
    expect(ids(withEndpoint)).not.toContain("network");
  });

  it("is not raised when public access is enabled", () => {
    expect(ids({ ...LIVE, publicNetworkAccess: "Enabled" })).not.toContain("network");
  });
});

describe("the role assignment check", () => {
  /**
   * The finding that is least obvious and most expensive to get wrong: these
   * roles carry dataActions and the control-plane roles do not, so being
   * subscription Owner does not let you read a blob.
   */
  it.each(["Owner", "Contributor", "Reader", "Storage Account Contributor"])(
    "does not accept the control-plane role %j as blob access",
    (roleDefinitionName) => {
      const observed = { ...HEALTHY, roleAssignments: [{ roleDefinitionName }] };
      expect(ids(observed)).toContain("rbac");
    },
  );

  it.each(BLOB_DATA_ROLES)("accepts the data-plane role %j", (roleDefinitionName) => {
    const observed = { ...HEALTHY, roleAssignments: [{ roleDefinitionName }] };
    expect(ids(observed)).not.toContain("rbac");
  });

  it("explains that the grant is unverifiable while the network blocks the request", () => {
    const blocker = diagnose(LIVE).blockers.find((item) => item.id === "rbac");
    expect(blocker?.detail).toContain("Fix the network first");
  });

  it("does not say that when the network is open and the answer is trustworthy", () => {
    const observed = { ...HEALTHY, roleAssignments: [] };
    const blocker = diagnose(observed).blockers.find((item) => item.id === "rbac");
    expect(blocker?.detail).not.toContain("Fix the network first");
  });

  /**
   * A failed lookup must not be reported as a missing assignment — that would
   * send someone to request a grant they may already hold.
   */
  it("distinguishes a lookup that could not run from a role that is absent", () => {
    const unchecked = { ...HEALTHY, roleAssignments: undefined };
    expect(ids(unchecked)).toContain("rbac-unknown");
    expect(ids(unchecked)).not.toContain("rbac");

    const checked = { ...HEALTHY, roleAssignments: [] };
    expect(ids(checked)).toContain("rbac");
    expect(ids(checked)).not.toContain("rbac-unknown");
  });
});

describe("the App Service blockers", () => {
  it("reports a private endpoint the application cannot reach", () => {
    const observed = {
      ...HEALTHY,
      publicNetworkAccess: "Disabled",
      privateEndpoints: ["pe"],
      appServiceVnetSubnetId: null,
    };
    expect(ids(observed)).toContain("app-not-integrated");
  });

  it("is satisfied once the application is integrated into the VNet", () => {
    const observed = {
      ...HEALTHY,
      publicNetworkAccess: "Disabled",
      privateEndpoints: ["pe"],
      appServiceVnetSubnetId: "/subscriptions/x/.../subnets/snet-app",
    };
    expect(ids(observed)).not.toContain("app-not-integrated");
  });

  it.each(["Free", "Shared"])("flags the %j tier, which cannot integrate at all", (tier) => {
    expect(ids({ ...LIVE, appServicePlanTier: tier })).toContain("plan-tier");
  });

  it.each(["Basic", "PremiumV3"])("accepts the %j tier", (tier) => {
    expect(ids({ ...LIVE, appServicePlanTier: tier })).not.toContain("plan-tier");
  });

  /**
   * The tier only matters as a prerequisite for the private-endpoint route. If
   * an exemption opens the public endpoint instead, a Free plan is fine, and
   * reporting it would send someone to spend money they do not need to.
   */
  it("does not mention the tier when the network is already open", () => {
    expect(ids({ ...LIVE, publicNetworkAccess: "Enabled" })).not.toContain("plan-tier");
  });

  it("reports a missing managed identity as having no principal to grant to", () => {
    const blocker = diagnose(LIVE).blockers.find((item) => item.id === "no-identity");
    expect(blocker?.detail).toContain("no principal");
  });
});

describe("blocker shape", () => {
  it("gives every blocker a title, a detail and an actionable fix", () => {
    for (const blocker of diagnose(LIVE).blockers) {
      expect(blocker.title.length).toBeGreaterThan(0);
      expect(blocker.detail.length).toBeGreaterThan(0);
      expect(blocker.fix.length).toBeGreaterThan(0);
    }
  });
});
