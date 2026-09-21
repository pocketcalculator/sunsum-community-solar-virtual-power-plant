import { describe, expect, it } from "vitest";
import {
  EMPTY_PROFILE_DRAFT,
  type ProfileDraft,
} from "@/features/onboarding/model/profile";
import {
  buildProfileSummary,
  validateProfileDetailsStep,
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

  it("rejects a name made only of invisible formatting characters", () => {
    // Reported on the pull request: these survive trim(), so the required-field
    // check passed and the summary showed a blank-looking organisation.
    for (const invisible of ["\u200d", "\u200b\u200d\u2060", "\u200d  \u200d"]) {
      expect(validateOrganisationName(invisible, "organisation")?.field).toBe(
        "organisationName",
      );
    }
  });
});

describe("step validation", () => {
  it("reports the missing fictional details without an account or credential gate", () => {
    const issues = validateProfileDetailsStep(EMPTY_PROFILE_DRAFT);
    expect(issues.map((issue) => issue.field)).toEqual([
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
    expect(validateProfileDetailsStep(completeDraft)).toEqual([]);
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

  it("trims input and resolves a preview context, not a workspace grant", () => {
    const summary = buildProfileSummary(completeDraft);
    expect(summary).toEqual({
      fullName: "Ada Lovelace",
      email: "ada@example.org",
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

  it.each(["student-researcher", "workforce-participant", "learning-more", "legal-adviser"] as const)(
    "keeps %s in learning without a workspace assignment", (userTypeId) => {
    const summary = buildProfileSummary({
      ...completeDraft,
      userTypeId,
    });
    expect(summary?.role).toBeNull();
    },
  );

  it("never carries a credential", () => {
    const summary = buildProfileSummary(completeDraft);
    const serialised = JSON.stringify(summary);
    expect(Object.keys(summary ?? {})).not.toContain("password");
    expect(serialised).not.toMatch(/password/i);
    expect(Object.keys(summary ?? {})).not.toContain("accountMethodId");
  });
});
