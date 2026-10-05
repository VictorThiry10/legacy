"use client";
import { useEffect } from "react";

let locks = 0; // pop-ups open right now
let clipped = false; // whether <html> was made unscrollable for them

// While a pop-up is open, the page behind it stays still. On a phone every drag is cancelled unless it starts in a
// list marked data-scrolls that has something to scroll. With a mouse or trackpad the page itself is made unscrollable
// (overflow on <html>, which keeps the sticky tab bar where it is). Never that on a phone, where cancelling the drag
// already does the job: in the iPhone app, pop-ups and bottom bars were drifting with the page instead of staying
// put (2026-10-05), and switching the page's scrolling off and on is the one thing those screens had in common.
export function useScrollLock(on = true) {
  useEffect(() => {
    if (!on) return;
    const html = document.documentElement;
    if (locks++ === 0 && (clipped = window.matchMedia("(hover: hover) and (pointer: fine)").matches)) html.style.overflow = "hidden";
    const stop = (e: TouchEvent) => {
      const list = e.target instanceof Element ? e.target.closest("[data-scrolls]") : null;
      if (!list || list.scrollHeight <= list.clientHeight) e.preventDefault();
    };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => {
      document.removeEventListener("touchmove", stop);
      if (--locks === 0 && clipped) html.style.overflow = "";
    };
  }, [on]);
}

// The same, for pop-ups drawn on the server (the trade summary): render it inside the pop-up.
export default function ScrollLock() {
  useScrollLock();
  return null;
}
