"use client";

import { useEffect } from "react";

export function AutoRefresh({ everyMs }: { everyMs: number }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.reload();
    }, everyMs);

    return () => window.clearTimeout(timer);
  }, [everyMs]);

  return null;
}

