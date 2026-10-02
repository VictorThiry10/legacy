"use client";
import { addTransitionType, startTransition } from "react";

// History bookkeeping for the back arrows (BackLink).
// 1. Every history entry the app makes records how deep it is, so a back arrow knows whether the page behind it is
//    one of ours (then it steps back in history: instant, and that page keeps its scroll position) or not (the page
//    was opened from an email, say: then it opens the page above instead).
// 2. A step back in history carries no direction, so pages wouldn't slide. React only ties a direction to a
//    navigation when it's added in the same event handler that starts it, and Next starts history steps in its own
//    popstate listener. So popstate listeners are wrapped: when a back arrow started the step, "nav-back" is added
//    right after Next's listener runs. The phone's own back gesture keeps its native animation.

const DEPTH = "__legacyDepth";
const depth = () => Number(window.history.state?.[DEPTH] ?? 0);
export const canGoBack = () => depth() > 0;

let stepping = 0; // when a back arrow last asked for a step back
let then: (() => void) | null = null;

// One step back in history, sliding back. `after` runs once the page behind is showing.
export function goBack(after?: () => void) {
  stepping = Date.now();
  then = after ?? null;
  window.history.back();
}

if (typeof window !== "undefined" && !("__legacyHistory" in window)) {
  Object.assign(window, { __legacyHistory: true });
  const h = window.history;
  const push = h.pushState.bind(h);
  const replace = h.replaceState.bind(h);
  h.pushState = (data, unused, url) => push({ ...data, [DEPTH]: depth() + 1 }, unused, url);
  h.replaceState = (data, unused, url) => replace({ ...data, [DEPTH]: depth() }, unused, url);

  // Added before Next's listener, so it runs first: it clears the flag once every listener has had its turn.
  window.addEventListener("popstate", () => setTimeout(() => {
    const ours = Date.now() - stepping < 1000;
    const after = then;
    stepping = 0;
    then = null;
    if (ours) after?.();
  }));

  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  const wrapped = new WeakMap<object, EventListener>();
  window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
    if (type !== "popstate" || typeof fn !== "function") return add(type, fn, opts);
    let w = wrapped.get(fn);
    if (!w) {
      w = (e: Event) => {
        fn.call(window, e);
        if (Date.now() - stepping < 1000) startTransition(() => addTransitionType("nav-back"));
      };
      wrapped.set(fn, w);
    }
    add(type, w, opts);
  }) as typeof window.addEventListener;
  window.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions) =>
    remove(type, (type === "popstate" && wrapped.get(fn)) || fn, opts)) as typeof window.removeEventListener;
}

// Rendered once in the league layout, so this module loads before the router starts listening.
export default function NavTracker() {
  return null;
}
