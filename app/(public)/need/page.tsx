import type { Metadata } from "next";
import { PublicStoryPage } from "@/features/community-context";
import { PageAudioPlayer, pageAudio } from "@/features/participation";

export const metadata: Metadata = { title: "The Need" };

export default function NeedPage() {
  return <PublicStoryPage topic="need" audio={<PageAudioPlayer audio={pageAudio("need")} />} />;
}
