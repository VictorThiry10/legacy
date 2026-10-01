"use client";
import { useEffect, useState } from "react";

// Fallback for LocalTime when the phone hasn't told us its time zone yet: fills the time in after loading.
export default function ClientTime({ iso, mode = "time" }: { iso: string; mode?: "time" | "day" | "date" }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date(iso);
    const t = setTimeout(() => {
      if (mode === "time") setText(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
      else if (mode === "day") setText(d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
      else setText(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
    }, 0);
    return () => clearTimeout(t);
  }, [iso, mode]);
  return <span suppressHydrationWarning>{text ?? ""}</span>;
}
