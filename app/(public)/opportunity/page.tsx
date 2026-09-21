import type { Metadata } from "next";
import { PublicStoryPage } from "@/features/community-context";
import { PageAudioPlayer, pageAudio } from "@/features/participation";

export const metadata: Metadata = { title: "The Opportunity" };

export default function OpportunityPage() {
  return <PublicStoryPage topic="opportunity" audio={<PageAudioPlayer audio={pageAudio("opportunity")} />} />;
}
