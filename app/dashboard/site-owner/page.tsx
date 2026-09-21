import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connectedWorkspaceHref } from "@/domain/workspace-routes";

export const metadata: Metadata = {
  title: "Site owner workspace",
  description: "Open your permitted SunSum sites. This link does not change your identity or access.",
  robots: { index: false, follow: false },
};

export default async function SiteOwnerDashboardPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(connectedWorkspaceHref({ ...await searchParams, view: "sites" }));
}
