import type { Metadata } from "next";
import { LandingPage } from "@/features/participation";

export const metadata: Metadata = {
  title: "Community solar - public interface preview",
  description:
    "Explore the public design foundation for Sunsum's planned site-owner, operator and investor workspaces. No live projects or accounts are connected.",
};

export default function HomePage() {
  return <LandingPage />;
}
