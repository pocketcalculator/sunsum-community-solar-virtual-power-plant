import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connectedWorkspaceHref } from "@/domain/workspace-routes";

export const metadata: Metadata = {
  title: "Investor workspace",
  description: "Open your permitted SunSum portfolio. This link does not change your identity or access.",
  robots: { index: false, follow: false },
};

export default async function InvestorDashboardPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(connectedWorkspaceHref({ ...await searchParams, view: "portfolio" }));
}
