import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connectedWorkspaceHref } from "@/domain/workspace-routes";

export const metadata: Metadata = {
  title: "SunSum workspace",
  description: "Read your permitted SunSum project information.",
  robots: { index: false, follow: false },
};

export default async function ConceptPage({ params, searchParams }: {
  params: Promise<{ concept: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { concept } = await params;
  const query = await searchParams;
  if (concept !== "sunroom" && concept !== "gridline") notFound();
  redirect(connectedWorkspaceHref(query));
}
