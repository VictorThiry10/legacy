"use client";
import { useLayoutEffect, useRef } from "react";
import { cameBack, historyDepth } from "./NavTracker";

// Where each history entry's box was scrolled to (left, top). Lives as long as the app stays open.
const places = new Map<number, [number, number]>();

// A list that scrolls inside its own box, so its header rows can stay at the top of it (the Players table). The
// page around it doesn't scroll, so the browser has nothing to put back when you return from a player's page: the
// box remembers its own place for each step in history, and goes back to it when you step back.
// `at`: the page's address, so a new page in the same box is noticed.
export default function ScrollBox({ at, className, children }: { at: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const here = historyDepth();
    const was = cameBack() ? places.get(here) : undefined;
    if (was) el.scrollTo(was[0], was[1]);
    else places.set(here, [el.scrollLeft, el.scrollTop]); // a new step starts from what's on screen
    const save = () => places.set(historyDepth(), [el.scrollLeft, el.scrollTop]);
    el.addEventListener("scroll", save, { passive: true });
    return () => el.removeEventListener("scroll", save);
  }, [at]);
  return <div ref={ref} className={className}>{children}</div>;
}
