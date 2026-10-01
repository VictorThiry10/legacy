"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

// Swipe left / right on a matchup to go to the next / previous one (slides like a page turn).
// Neighbours are loaded in advance so the swipe is instant, and the current chip is scrolled into view.
export default function MatchupSwipe({ prev, next, children }: { prev?: string; next?: string; children: React.ReactNode }) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (prev) router.prefetch(prev);
    if (next) router.prefetch(next);
    document.getElementById("current-matchup")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [prev, next, router]);
  return (
    <div
      onTouchStart={(e) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < 1.5 * Math.abs(dy)) return; // a scroll, not a swipe
        if (dx < 0 && next) router.push(next, { scroll: false, transitionTypes: ["nav-forward"] });
        if (dx > 0 && prev) router.push(prev, { scroll: false, transitionTypes: ["nav-back"] });
      }}
    >
      {children}
    </div>
  );
}
