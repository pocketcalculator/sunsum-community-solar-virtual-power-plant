import type { Metadata } from "next";
import { ContextPage, contextPage } from "@/features/participation";

const content = contextPage("opportunity");

export const metadata: Metadata = {
  title: content.navLabel,
  description: content.summary,
};

export default function OpportunityPage() {
  return <ContextPage content={content} />;
}
