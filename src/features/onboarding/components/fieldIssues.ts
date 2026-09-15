import type { ErrorSummaryItem } from "@/components/ui/form/ErrorSummary";
import type { FieldIssue, ProfileField } from "../model/profile";

/**
 * Where each field lives in the page.
 *
 * One place owns these ids so the control, its error text and the error summary
 * link cannot drift apart. Grouped answers point at their `<fieldset>`, which is
 * focusable, so following a link announces the question as well as the message.
 */
export const FIELD_ANCHOR = {
  intentOptionIds: "profile-intent",
  accountMethodId: "profile-account-method",
  fullName: "profile-full-name",
  email: "profile-email",
  password: "profile-password",
  representation: "profile-representation",
  organisationName: "profile-organisation-name",
  userTypeId: "profile-user-type",
  consentAccepted: "profile-consent",
} satisfies Record<ProfileField, string>;

export function messageFor(
  issues: readonly FieldIssue[],
  field: ProfileField,
): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
}

export function toSummaryItems(
  issues: readonly FieldIssue[],
): readonly ErrorSummaryItem[] {
  return issues.map((issue) => ({
    targetId: FIELD_ANCHOR[issue.field],
    message: issue.message,
  }));
}
