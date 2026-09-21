import type { Metadata } from "next";
import { ContextPage, contextPage } from "@/features/participation";

const content = contextPage("impact");

export const metadata: Metadata = {
  title: content.navLabel,
  description: content.summary,
};

export default function ImpactPage() {
  return <ContextPage content={content} />;
}
