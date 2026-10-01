"use client";
import { useSyncExternalStore } from "react";

// One shared ticking clock (5 times a second) for every countdown on the page.
let now = typeof window === "undefined" ? 0 : Date.now();
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  subs.add(cb);
  now = Date.now();
  timer ??= setInterval(() => {
    now = Date.now();
    subs.forEach((f) => f());
  }, 200);
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// Milliseconds since 1970. The server's time is used while the page first loads, so both render the same.
export function useNow(serverNow: number) {
  return useSyncExternalStore(subscribe, () => now, () => serverNow);
}
