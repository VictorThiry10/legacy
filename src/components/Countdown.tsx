"use client";
import { useEffect, useState } from "react";

export default function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState<number | null>(null); // unknown until the browser takes over
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (now === null) return <span className="num font-semibold">…</span>;
  const left = Math.max(0, new Date(until).getTime() - now);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return <span className={`num font-semibold ${left < 60000 ? "text-bad" : ""}`}>{left ? `${m}:${String(s).padStart(2, "0")}` : "Closed"}</span>;
}
