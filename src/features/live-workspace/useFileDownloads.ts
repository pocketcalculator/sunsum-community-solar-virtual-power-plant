"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReadDownload } from "@/features/live-read";

export function useFileDownloads(scopeKey: string) {
  const links = useRef(new Map<string, number>());
  useEffect(() => {
    const active = links.current;
    return () => {
      for (const [url, timer] of active) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      active.clear();
    };
  }, [scopeKey]);

  return useCallback((file: ReadDownload) => {
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.fileName;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      links.current.delete(url);
    }, 1_000);
    links.current.set(url, timer);
  }, []);
}
