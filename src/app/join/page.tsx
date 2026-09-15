import type { Metadata } from "next";
import { isIntentOptionId, type IntentOptionId } from "@/domain/intents";
import { CreateProfileFlow } from "@/features/onboarding";

export const metadata: Metadata = {
  title: "Create your profile",
  description:
    "Set up a Sunsum participant profile. This is a public interface preview: no account is created and nothing you enter is saved.",
};

interface JoinPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `?start=` lets the landing page open this flow with a guided answer already
 * chosen. Anything unrecognised is ignored rather than failing the page, since
 * a stale or hand-edited link should still reach a usable form. Repeats are
 * dropped: `?start=x&start=x` is one answer, not two.
 */
function readStartOptions(
  value: string | string[] | undefined,
): readonly IntentOptionId[] {
  const candidates = typeof value === "string" ? [value] : (value ?? []);
  const recognised = candidates.filter(
    (candidate): candidate is IntentOptionId => isIntentOptionId(candidate),
  );

  return [...new Set(recognised)];
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const params = await searchParams;

  return (
    <CreateProfileFlow initialIntentOptionIds={readStartOptions(params.start)} />
  );
}
