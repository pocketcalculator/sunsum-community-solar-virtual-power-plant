import type { AnchorHTMLAttributes } from "react";
import { staticHref } from "@/features/design-lab";

export default function StaticLink({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} href={staticHref(href)} />;
}
