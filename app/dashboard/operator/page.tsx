import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connectedWorkspaceHref } from "@/domain/workspace-routes";

export const metadata: Metadata = {
  title: "Operator workspace",
  description: "Open the permitted SunSum action center. This link does not change your identity or access.",
  robots: { index: false, follow: false },
};

export default async function OperatorDashboardPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(connectedWorkspaceHref({ ...await searchParams, view: "queue" }));
}
