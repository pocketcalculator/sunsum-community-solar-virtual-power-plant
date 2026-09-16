// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toDomainRole, toWireRole } from "@/backend";
import { journeyStageId, journeyStageIdForProject, PROJECT_STAGES } from "@/backend/core";
import { PARTICIPANT_ROLES } from "@/domain/roles";
import { JOURNEY_STAGES } from "@/domain/journey";

/**
 * WS1 owns the charter vocabulary in `src/domain`; the backend owns the wire
 * vocabulary. Neither may be renamed to suit the other, so these tests exist to
 * fail the moment a value is added on one side without an adapter entry on the
 * other, rather than letting the mismatch surface as a blank screen.
 */
describe("backend boundary vocabulary", () => {
  it("adapts charter role ids to backend wire roles", () => {
    expect(toWireRole("site-owner")).toBe("site_owner");
    expect(toWireRole("operator")).toBe("operator");
    expect(toWireRole("financier")).toBe("investor");
  });

  it("adapts backend wire roles to charter role ids", () => {
    expect(toDomainRole("site_owner")).toBe("site-owner");
    expect(toDomainRole("operator")).toBe("operator");
    expect(toDomainRole("investor")).toBe("financier");
  });

  it("covers every charter role and round-trips it unchanged", () => {
    expect(PARTICIPANT_ROLES.length).toBeGreaterThan(0);
    for (const role of PARTICIPANT_ROLES) {
      const wire = toWireRole(role.id);
      expect(wire, `no wire role for charter role ${role.id}`).toBeDefined();
      expect(toDomainRole(wire)).toBe(role.id);
    }
  });

  it("maps every backend project stage onto a charter journey stage", () => {
    const journeyIds = new Set<string>(JOURNEY_STAGES.map((stage) => stage.id));
    for (const stage of PROJECT_STAGES) {
      const mapped = journeyStageId("accepted", stage);
      expect(mapped, `no journey stage for project stage ${stage}`).not.toBeNull();
      expect(journeyIds.has(mapped as string), `journey ribbon has no "${mapped}"`).toBe(true);
    }
  });

  it("places a site with no project on the ribbon by submission status alone", () => {
    const journeyIds = new Set<string>(JOURNEY_STAGES.map((stage) => stage.id));
    expect(journeyStageId("submitted", null)).toBe("submitted");
    expect(journeyIds.has(journeyStageId("submitted", null) as string)).toBe(true);
    expect(journeyStageId("screening", null)).toBe("screening");
    expect(journeyStageId("draft", null)).toBeNull();
    expect(journeyStageId("rejected", null)).toBeNull();
  });

  it("gives every project stage a ribbon id without a null to unwrap", () => {
    const journeyIds = new Set<string>(JOURNEY_STAGES.map((stage) => stage.id));
    for (const stage of PROJECT_STAGES) {
      const mapped = journeyStageIdForProject(stage);
      expect(journeyIds.has(mapped), `journey ribbon has no "${mapped}"`).toBe(true);
      expect(mapped).toBe(journeyStageId("accepted", stage));
    }
  });

  it("never emits a wire stage token as a ribbon id", () => {
    /**
     * `pre_development` and `pre-development` differ only by separator, which is
     * exactly the mismatch that would fail silently in a lookup rather than
     * loudly at the boundary.
     */
    const journeyIds = new Set<string>(JOURNEY_STAGES.map((stage) => stage.id));
    for (const stage of PROJECT_STAGES) {
      if (journeyIds.has(stage)) continue;
      expect(journeyStageIdForProject(stage)).not.toBe(stage);
    }
    expect(journeyStageIdForProject("pre_development")).toBe("pre-development");
  });
});
