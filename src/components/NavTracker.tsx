"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Remembers whether this tab has moved between pages of the app since it opened (for BackLink).
let moved = false;
export const cameFromApp = () => moved;

export default function NavTracker() {
  const path = usePathname();
  const first = useRef(path);
  useEffect(() => {
    if (path !== first.current) moved = true;
  }, [path]);
  return null;
}
