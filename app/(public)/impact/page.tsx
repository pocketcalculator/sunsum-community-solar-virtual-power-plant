import type { Metadata } from "next";
import { PublicStoryPage } from "@/features/community-context";
import { PageAudioPlayer, pageAudio } from "@/features/participation";

export const metadata: Metadata = { title: "The Impact" };

export default function ImpactPage() {
  return <PublicStoryPage topic="impact" audio={<PageAudioPlayer audio={pageAudio("impact")} />} />;
}
