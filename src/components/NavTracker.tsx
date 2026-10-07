"use client";

// History bookkeeping for the back arrows (BackLink).
// 1. Every history entry the app makes records how deep it is, so a back arrow knows whether the page behind it is
//    one of ours (then it steps back in history: instant, and that page keeps its scroll position) or not (the page
//    was opened from an email, say: then it opens the page above instead).
// 2. It also knows whether the page on screen was reached by a step back or forward (cameBack), for lists that
//    put their own scroll position back (ScrollBox).
// 3. React draws a step back in history straight away so the browser can put the scroll back, and that path never
//    animates. So goBack runs the slide itself with the browser's view transition: the page slides back in while the
//    tab bar stays put (the CSS is under html[data-nav="back"] in globals.css). The phone's own back gesture keeps
//    its native animation.

const DEPTH = "__legacyDepth";
const depth = () => Number(window.history.state?.[DEPTH] ?? 0);
export const canGoBack = () => depth() > 0;
export const historyDepth = depth;

// Whether the page on screen was reached by stepping back or forward in history (not by opening a new page).
let stepped = false;
export const cameBack = () => stepped;

let popped: (() => void) | null = null; // runs once the page behind is on screen

// One step back in history, sliding back. `after` runs once the page behind is showing.
export function goBack(after?: () => void) {
  const shown = new Promise<void>((resolve) => {
    popped = resolve;
    setTimeout(resolve, 1500); // in case no step happens
  });
  if (after) shown.then(after);
  const doc = document as Document & { startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> } };
  if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.history.back();
    return;
  }
  const html = document.documentElement;
  html.dataset.nav = "back";
  doc.startViewTransition(() => {
    window.history.back();
    return shown;
  }).finished.finally(() => delete html.dataset.nav);
}

if (typeof window !== "undefined" && !("__legacyHistory" in window)) {
  Object.assign(window, { __legacyHistory: true });
  const h = window.history;
  const push = h.pushState.bind(h);
  const replace = h.replaceState.bind(h);
  h.pushState = (data, unused, url) => {
    stepped = false;
    push({ ...data, [DEPTH]: depth() + 1 }, unused, url);
  };
  h.replaceState = (data, unused, url) => replace({ ...data, [DEPTH]: depth() }, unused, url);
  // The router redraws the page behind during the popstate event; by the next task it's on screen.
  window.addEventListener("popstate", () => {
    stepped = true;
    setTimeout(() => {
      popped?.();
      popped = null;
    });
  });
}

// Rendered once in the league layout, so this module loads on every page of the app.
export default function NavTracker() {
  return null;
}
