"use client";
import { useEffect } from "react";

let locks = 0; // pop-ups open right now

// While a pop-up is open, the page behind it stays still. The page itself can't scroll (overflow on <html>, which
// keeps the sticky tab bar where it is), and since iPhones can still drag the page from a touch that starts on the
// pop-up, every drag is cancelled unless it starts in a list marked data-scrolls that has something to scroll.
export function useScrollLock(on = true) {
  useEffect(() => {
    if (!on) return;
    const html = document.documentElement;
    if (locks++ === 0) html.style.overflow = "hidden";
    const stop = (e: TouchEvent) => {
      const list = e.target instanceof Element ? e.target.closest("[data-scrolls]") : null;
      if (!list || list.scrollHeight <= list.clientHeight) e.preventDefault();
    };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => {
      document.removeEventListener("touchmove", stop);
      if (--locks === 0) html.style.overflow = "";
    };
  }, [on]);
}

// The same, for pop-ups drawn on the server (the trade summary): render it inside the pop-up.
export default function ScrollLock() {
  useScrollLock();
  return null;
}
