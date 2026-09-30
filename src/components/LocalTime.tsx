"use client";
import { useEffect, useState } from "react";

// Shows a time in the viewer's own time zone (the server doesn't know it).
export default function LocalTime({ iso, mode = "time" }: { iso: string; mode?: "time" | "day" | "date" }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date(iso);
    const t = setTimeout(() => {
      if (mode === "time") setText(d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      else if (mode === "day") setText(d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }));
      else setText(d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }));
    }, 0);
    return () => clearTimeout(t);
  }, [iso, mode]);
  return <span suppressHydrationWarning>{text ?? ""}</span>;
}
