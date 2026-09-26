import { describe, expect, it } from "vitest";
import {
  INTENT_PROMPT_LIST,
  isIntentOptionId,
  suggestedUserTypes,
} from "@/domain/intents";
import { USER_TYPES, isUserTypeId } from "@/domain/userTypes";
import {
  EMPTY_PROFILE_DRAFT,
  type ProfileDraft,
} from "@/features/onboarding/model/profile";
import {
  FIRST_STEP,
  PROFILE_STEP_LIST,
  canEnterStep,
  firstBlockingStep,
  getProfileStep,
  nextStep,
  previousStep,
  stepIndex,
  validateStep,
} from "@/features/onboarding/model/steps";

const completeDraft: ProfileDraft = {
  ...EMPTY_PROFILE_DRAFT,
  fullName: "Ada Lovelace",
  email: "ada@example.org",
  representation: "individual",
  userTypeId: "property-owner",
  consentAccepted: true,
};

const empty = EMPTY_PROFILE_DRAFT;
const complete = completeDraft;

describe("guided intents", () => {
  it("has unique option ids that all point at real user types", () => {
    const ids = INTENT_PROMPT_LIST.flatMap((prompt) =>
      prompt.options.map((option) => option.id),
    );
    expect(new Set(ids).size).toBe(ids.length);

    for (const prompt of INTENT_PROMPT_LIST) {
      for (const option of prompt.options) {
        expect(option.suggests.length).toBeGreaterThan(0);
        for (const suggestion of option.suggests) {
          expect(isUserTypeId(suggestion)).toBe(true);
        }
      }
    }
  });

  it.each(["", "i-am", "I-AM-FUNDER", "unknown", "__proto__"])(
    "rejects %j as an option id",
    (value) => {
      expect(isIntentOptionId(value)).toBe(false);
    },
  );

  it("suggests nothing when nothing is chosen", () => {
    expect(suggestedUserTypes([])).toEqual([]);
  });

  it("returns each suggested type once, in taxonomy order", () => {
    const suggestions = suggestedUserTypes([
      "i-have-roof",
      "i-would-use-solar",
    ]);

    expect(suggestions).toContain("property-owner");
    expect(suggestions).toContain("site-host");
    expect(new Set(suggestions).size).toBe(suggestions.length);

    const taxonomyOrder = USER_TYPES.map((type) => type.id).filter((id) =>
      suggestions.includes(id),
    );
    expect(suggestions).toEqual(taxonomyOrder);
  });

  it("ignores ids that are not selected", () => {
    expect(new Set(suggestedUserTypes(["i-would-fund"]))).toEqual(
      new Set(["philanthropy", "nmtc", "cdfi-cde"]),
    );
  });
});

describe("step machine", () => {
  it("starts at the guided step and ends at review", () => {
    expect(FIRST_STEP).toBe("start");
    expect(PROFILE_STEP_LIST.map((step) => step.id)).toEqual([
      "start",
      "details",
      "representation",
      "user-type",
      "review",
    ]);
  });

  it("treats the guided opening as optional", () => {
    expect(validateStep("start", empty)).toEqual([]);
  });

  it("moves forwards and backwards within bounds", () => {
    expect(nextStep("start")).toBe("details");
    expect(nextStep("review")).toBeNull();
    expect(previousStep("start")).toBeNull();
    expect(previousStep("details")).toBe("start");
    expect(stepIndex("user-type")).toBe(3);
  });

  it("only opens a step once every earlier step passes", () => {
    expect(canEnterStep("start", empty)).toBe(true);
    expect(canEnterStep("details", empty)).toBe(true);
    expect(canEnterStep("representation", empty)).toBe(false);
    expect(canEnterStep("review", complete)).toBe(true);
  });

  it("needs only valid fictional details, not authentication, to continue", () => {
    expect(validateStep("details", complete)).toEqual([]);
    expect(canEnterStep("review", complete)).toBe(true);
    expect(firstBlockingStep(complete)).toBeNull();
  });

  it("reports the earliest step still holding the flow up", () => {
    expect(firstBlockingStep(empty)).toBe("details");

    const withDetails: ProfileDraft = {
      ...EMPTY_PROFILE_DRAFT,
      fullName: "Ada Lovelace",
      email: "ada@example.org",
    };
    expect(firstBlockingStep(withDetails)).toBe("representation");
    expect(firstBlockingStep(complete)).toBeNull();
  });

  it("blocks a complete draft that has not consented", () => {
    const withoutConsent: ProfileDraft = {
      ...completeDraft,
      consentAccepted: false,
    };

    expect(firstBlockingStep(withoutConsent)).toBe("review");
  });

  it("fails loudly on an unknown step", () => {
    // @ts-expect-error deliberately bypassing the guard to prove it throws.
    expect(() => getProfileStep("nope")).toThrow(/Unknown profile step/);
  });
});
