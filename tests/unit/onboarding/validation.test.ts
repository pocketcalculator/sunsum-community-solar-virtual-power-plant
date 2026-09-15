import { describe, expect, it } from "vitest";
import {
  EMPTY_PROFILE_DRAFT,
  type ProfileDraft,
} from "@/features/onboarding/model/profile";
import {
  PASSWORD_MIN,
  assessPassword,
  buildProfileSummary,
  validateAccountStep,
  validateEmail,
  validateFullName,
  validateOrganisationName,
  validateRepresentationStep,
  validateReviewStep,
  validateUserTypeStep,
} from "@/features/onboarding/model/validation";

const completeDraft: ProfileDraft = {
  ...EMPTY_PROFILE_DRAFT,
  intentOptionIds: ["i-have-roof"],
  accountMethodId: "email",
  fullName: "  Ada Lovelace  ",
  email: " ada@example.org ",
  representation: "organisation",
  organisationName: "  Sweet Auburn Works  ",
  userTypeId: "property-owner",
  consentAccepted: true,
};

describe("name validation", () => {
  it.each(["", "   ", "\t"])("rejects blank name %j", (value) => {
    expect(validateFullName(value)?.field).toBe("fullName");
  });

  it("rejects an over-long name", () => {
    expect(validateFullName("a".repeat(121))?.message).toMatch(
      /120 characters/,
    );
  });

  it("accepts an ordinary name with surrounding space", () => {
    expect(validateFullName("  Ada Lovelace ")).toBeNull();
  });
});

describe("email validation", () => {
  it.each([
    "",
    "   ",
    "ada",
    "ada@",
    "@example.org",
    "ada@example",
    "ada example@x.org",
    "ada@@example.org",
    "ada@exa mple.org",
  ])("rejects %j", (value) => {
    expect(validateEmail(value)?.field).toBe("email");
  });

  it("rejects an address beyond the practical length limit", () => {
    const long = `${"a".repeat(250)}@example.org`;
    expect(validateEmail(long)?.message).toMatch(/254 characters/);
  });

  it.each([
    "ada@example.org",
    " ada@example.org ",
    "ada.lovelace+solar@sub.example.co.uk",
  ])("accepts %j", (value) => {
    expect(validateEmail(value)).toBeNull();
  });
});

describe("password assessment", () => {
  const context = { fullName: "Ada Lovelace", email: "ada@example.org" };

  it("requires a password", () => {
    expect(assessPassword("", context).issue?.message).toMatch(
      /Create a password/,
    );
  });

  it(`requires at least ${PASSWORD_MIN} characters`, () => {
    expect(assessPassword("Ab1!short", context).issue?.message).toMatch(
      new RegExp(`${PASSWORD_MIN} characters`),
    );
  });

  it("rejects a password beyond the maximum length", () => {
    expect(
      assessPassword(`Ab1!${"x".repeat(130)}`, context).issue?.message,
    ).toMatch(/128 characters or fewer/);
  });

  it("rejects surrounding whitespace", () => {
    expect(
      assessPassword(" Str0ng!Passphrase ", context).issue?.message,
    ).toMatch(/space at the start or end/);
  });

  it("requires a mix of character types", () => {
    expect(assessPassword("abcdefghijklmnop", context).issue?.message).toMatch(
      /at least three kinds of character/,
    );
  });

  it("is satisfiable in a script without capitals", () => {
    // Japanese has no upper case. Counting only ASCII letter classes would push
    // every such password into "symbols" and make the variety rule impossible.
    const result = assessPassword("さくら発電所プロジェクト-2026!", {
      fullName: "Ada Lovelace",
      email: "ada@example.org",
    });

    expect(result.issue).toBeNull();
    expect(result.variety).toBeGreaterThanOrEqual(3);
  });

  it("counts Cyrillic case as case, not as symbols", () => {
    const result = assessPassword("Солнце-Ток-77", {
      fullName: "Ada Lovelace",
      email: "ada@example.org",
    });

    expect(result.issue).toBeNull();
    expect(result.variety).toBeGreaterThanOrEqual(3);
  });

  it("rejects a password containing the person's name", () => {
    expect(assessPassword("Ada Lovelace1!x", context).issue?.message).toMatch(
      /not include your name/,
    );
  });

  it("rejects a password containing the email local part", () => {
    expect(assessPassword("XadaX1!superlong", context).issue?.message).toMatch(
      /not include your email/,
    );
  });

  it("accepts a strong passphrase and reports its variety", () => {
    const result = assessPassword("Correct-Horse-9!", context);
    expect(result.issue).toBeNull();
    expect(result.variety).toBe(4);
  });

  it("does not treat a very short name as a substring rule", () => {
    const result = assessPassword("Qx7!zzzzzzzzzz", {
      fullName: "Al",
      email: "al@example.org",
    });
    expect(result.issue).toBeNull();
  });
});

describe("organisation validation", () => {
  it("is not required for an individual", () => {
    expect(validateOrganisationName("", "individual")).toBeNull();
  });

  it("is required for an organisation", () => {
    expect(validateOrganisationName("  ", "organisation")?.field).toBe(
      "organisationName",
    );
  });

  it("caps the organisation name length", () => {
    expect(
      validateOrganisationName("o".repeat(161), "organisation")?.message,
    ).toMatch(/160 characters/);
  });
});

describe("step validation", () => {
  it("reports every missing account field at once", () => {
    const issues = validateAccountStep(EMPTY_PROFILE_DRAFT);
    expect(issues.map((issue) => issue.field)).toEqual([
      "accountMethodId",
      "fullName",
      "email",
    ]);
  });

  it("requires a representation choice", () => {
    expect(validateRepresentationStep(EMPTY_PROFILE_DRAFT)[0]?.field).toBe(
      "representation",
    );
  });

  it("requires a participant type", () => {
    expect(validateUserTypeStep(EMPTY_PROFILE_DRAFT)[0]?.field).toBe(
      "userTypeId",
    );
  });

  it("requires consent before finishing", () => {
    expect(validateReviewStep(EMPTY_PROFILE_DRAFT)[0]?.field).toBe(
      "consentAccepted",
    );
  });

  it("passes a complete draft", () => {
    expect(validateAccountStep(completeDraft)).toEqual([]);
    expect(validateRepresentationStep(completeDraft)).toEqual([]);
    expect(validateUserTypeStep(completeDraft)).toEqual([]);
    expect(validateReviewStep(completeDraft)).toEqual([]);
  });
});

describe("profile summary", () => {
  it("refuses to summarise an incomplete draft", () => {
    expect(buildProfileSummary(EMPTY_PROFILE_DRAFT)).toBeNull();
    expect(
      buildProfileSummary({ ...completeDraft, consentAccepted: false }),
    ).toBeNull();
    expect(
      buildProfileSummary({ ...completeDraft, userTypeId: null }),
    ).toBeNull();
  });

  it("trims input and resolves the mapped workspace", () => {
    const summary = buildProfileSummary(completeDraft);
    expect(summary).toEqual({
      fullName: "Ada Lovelace",
      email: "ada@example.org",
      accountMethodId: "email",
      representation: "organisation",
      organisationName: "Sweet Auburn Works",
      userTypeId: "property-owner",
      role: "site-owner",
      intentOptionIds: ["i-have-roof"],
    });
  });

  it("drops the organisation name for an individual", () => {
    const summary = buildProfileSummary({
      ...completeDraft,
      representation: "individual",
      organisationName: "ignored",
    });
    expect(summary?.organisationName).toBeNull();
  });

  it("reports no workspace for an interest-only participant type", () => {
    const summary = buildProfileSummary({
      ...completeDraft,
      userTypeId: "learning-more",
    });
    expect(summary?.role).toBeNull();
  });

  it("never carries a credential", () => {
    const summary = buildProfileSummary(completeDraft);
    const serialised = JSON.stringify(summary);
    expect(Object.keys(summary ?? {})).not.toContain("password");
    expect(serialised).not.toMatch(/password/i);
  });
});
