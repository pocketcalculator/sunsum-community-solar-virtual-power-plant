import { describe, expect, it } from "vitest";

import {
  INVESTOR_TYPES,
  investorTypeForUserType,
  USER_TYPE_BY_INVESTOR_TYPE,
  userTypeForInvestorType,
} from "@/backend/db/enums";
import { isUserTypeId, USER_TYPES } from "@/domain/userTypes";

/**
 * The sign-up form and the `investors` table describe the same seven funder
 * profiles in two different files and two different spellings. Review pointed
 * out that nothing kept them in step, so adding a profile to the form produced a
 * value the database rejects — and the failure would not appear until an
 * investor tried to finish onboarding.
 *
 * `USER_TYPE_BY_INVESTOR_TYPE` is typed `satisfies Record<InvestorType, ...>`,
 * which already breaks the build if a stored type has no form equivalent. These
 * tests cover the direction the type system cannot: that the form offers no
 * funder the database cannot hold.
 */
describe("investor types conform to the sign-up form's funder profiles", () => {
  const financeUserTypes = USER_TYPES.filter((type) => type.group === "finance");

  it("maps every investor type to a user type that actually exists", () => {
    for (const investorType of INVESTOR_TYPES) {
      const userTypeId = userTypeForInvestorType(investorType);
      expect(isUserTypeId(userTypeId), `${investorType} maps to unknown ${userTypeId}`).toBe(true);
    }
  });

  it("covers every funder the sign-up form offers", () => {
    const unmapped = financeUserTypes
      .map((type) => type.id)
      .filter((id) => investorTypeForUserType(id) === undefined);

    expect(
      unmapped,
      `the form offers funder profiles the investors table cannot store: ${unmapped.join(", ")}`,
    ).toEqual([]);
  });

  it("is one-to-one, so no two investor types collapse onto one profile", () => {
    const mapped = INVESTOR_TYPES.map(userTypeForInvestorType);

    expect(new Set(mapped).size).toBe(INVESTOR_TYPES.length);
    expect(mapped.length).toBe(financeUserTypes.length);
  });

  it("differs from the form only in case convention", () => {
    for (const investorType of INVESTOR_TYPES) {
      expect(USER_TYPE_BY_INVESTOR_TYPE[investorType]).toBe(investorType.replaceAll("_", "-"));
    }
  });
});
