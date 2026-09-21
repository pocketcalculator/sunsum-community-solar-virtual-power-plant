import type { Metadata } from "next";
import { ContextPage, contextPage } from "@/features/participation";

const content = contextPage("need");

export const metadata: Metadata = {
  title: content.navLabel,
  description: content.summary,
};

export default function NeedPage() {
  return <ContextPage content={content} />;
}
