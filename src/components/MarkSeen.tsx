"use client";
import { useEffect } from "react";
import { seen } from "@/app/(league)/league/moves/actions";

// Opening the moves log marks it seen: the red dot on the Team page's row goes until the next move.
export default function MarkSeen() {
  useEffect(() => {
    seen().catch(() => {});
  }, []);
  return null;
}
