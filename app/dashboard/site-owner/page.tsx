import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connectedWorkspaceHref } from "@/domain/workspace-routes";

export const metadata: Metadata = {
  title: "Site owner dashboard",
  description: "Read your permitted SunSum sites in the connected workspace.",
};

export default function SiteOwnerDashboardPage() {
  redirect(connectedWorkspaceHref({ view: "sites" }));
}