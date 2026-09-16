import type { Metadata } from "next";
import { SiteOwnerDashboard } from "@/features/site-owner-dashboard";

export const metadata: Metadata = {
  title: "Site owner dashboard",
  description:
    "An interactive Sunsum site-owner dashboard prototype using illustrative mock locations and comparison values.",
};

export default function SiteOwnerDashboardPage() {
  return <SiteOwnerDashboard />;
}
