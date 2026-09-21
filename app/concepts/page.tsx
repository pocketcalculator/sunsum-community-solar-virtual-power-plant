import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connectedWorkspaceHref } from "@/domain/workspace-routes";

export const metadata: Metadata = {
  title: "SunSum workspace",
  description: "Read your permitted SunSum project information.",
  robots: { index: false, follow: false },
};

export default async function ConceptsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(connectedWorkspaceHref(await searchParams));
}
