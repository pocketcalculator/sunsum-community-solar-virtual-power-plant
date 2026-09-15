import { describe, expect, it } from "vitest";
import {
  PARTICIPANT_ROLES,
  getParticipantRole,
  isParticipantRoleId,
} from "@/domain/roles";
import { JOURNEY_STAGES } from "@/domain/journey";
import {
  USER_TYPES,
  USER_TYPE_GROUPS,
  getUserType,
  isUserTypeId,
  userTypesInGroup,
} from "@/domain/userTypes";
import { ENTRY_PATHS, entryPathHref } from "@/features/participation";
import { isIntentOptionId } from "@/domain/intents";

describe("charter role vocabulary", () => {
  it("names exactly the three charter workspaces", () => {
    expect(PARTICIPANT_ROLES.map((role) => role.id)).toEqual([
      "site-owner",
      "operator",
      "financier",
    ]);
  });

  it.each(["site-owner", "operator", "financier"])("accepts %s", (value) => {
    expect(isParticipantRoleId(value)).toBe(true);
  });

  it.each(["", "owner", "Investor", "admin", "__proto__", "constructor"])(
    "rejects %j",
    (value) => {
      expect(isParticipantRoleId(value)).toBe(false);
    },
  );

  it("fails loudly rather than returning a placeholder role", () => {
    // @ts-expect-error deliberately bypassing the guard to prove it throws.
    expect(() => getParticipantRole("nope")).toThrow(
      /Unknown participant role/,
    );
  });
});

describe("delivery journey vocabulary", () => {
  it("keeps the charter's seven stages in order", () => {
    expect(JOURNEY_STAGES.map((stage) => stage.name)).toEqual([
      "Submitted",
      "Screening",
      "Pre-development",
      "Development",
      "Construction",
      "Commissioning",
      "Operations",
    ]);
  });
});

describe("participant taxonomy", () => {
  it("has unique ids and a known group for every type", () => {
    const ids = USER_TYPES.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);

    const groups = new Set(USER_TYPE_GROUPS.map((group) => group.id));
    for (const type of USER_TYPES) {
      expect(groups.has(type.group)).toBe(true);
    }
  });

  it("maps every type either to a charter role or to no workspace at all", () => {
    for (const type of USER_TYPES) {
      if (type.role !== null) {
        expect(isParticipantRoleId(type.role)).toBe(true);
      }
    }
  });

  it("places every type in exactly one group listing", () => {
    const grouped = USER_TYPE_GROUPS.flatMap((group) =>
      userTypesInGroup(group.id),
    );
    expect(grouped).toHaveLength(USER_TYPES.length);
  });

  it("covers the investor profiles the charter names", () => {
    const finance = userTypesInGroup("finance").map((type) => type.id);
    expect(finance).toEqual(
      expect.arrayContaining([
        "philanthropy",
        "impact-investor",
        "nmtc",
        "cdfi-cde",
        "energy-equity-fund",
        "corporate",
        "special-community-endowment",
      ]),
    );
  });

  it.each(["", "Property-Owner", "unknown", "__proto__"])(
    "rejects %j as a user type",
    (value) => {
      expect(isUserTypeId(value)).toBe(false);
    },
  );

  it("fails loudly on an unknown user type", () => {
    // @ts-expect-error deliberately bypassing the guard to prove it throws.
    expect(() => getUserType("nope")).toThrow(/Unknown user type/);
  });
});

describe("landing entry paths", () => {
  it("offers the charter's rooftop, land and financier routes", () => {
    expect(ENTRY_PATHS.map((path) => path.id)).toEqual([
      "rooftop",
      "land",
      "funding",
    ]);
  });

  it("deep links into the flow with a real guided answer", () => {
    for (const path of ENTRY_PATHS) {
      expect(isIntentOptionId(path.intentOptionId)).toBe(true);
      expect(entryPathHref(path)).toBe(
        `/join?start=${encodeURIComponent(path.intentOptionId)}`,
      );
    }
  });
});
