import type { Metadata } from "next";
import { LandingPage } from "@/features/participation";

export const metadata: Metadata = {
  title: "Community solar - public interface preview",
};

export default function HomePage() {
  return <LandingPage />;
}
