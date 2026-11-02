"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Reloads the page data every few seconds (live scores), and right away when the app comes back on screen.
// With `watch`, a URL whose text changes when the data does (api/stamp: when scores last updated), each tick fetches
// that first and only reloads the page when it moved: a full server render every minute for 8 GMs was most of our
// compute bill, while live scores only change every 2 minutes.
export default function AutoRefresh({ seconds = 5, watch }: { seconds?: number; watch?: string }) {
  const router = useRouter();
  useEffect(() => {
    let last: string | null = null;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (!watch) return router.refresh();
      const now = await fetch(watch, { cache: "no-store" }).then((r) => r.text()).catch(() => null);
      if (now === null || (last !== null && now !== last)) router.refresh();
      last = now;
    };
    const t = setInterval(tick, seconds * 1000);
    // Only while the app is on screen; coming back to it refreshes straight away.
    const back = () => {
      if (document.visibilityState !== "visible") return;
      last = null;
      router.refresh();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [router, seconds, watch]);
  return null;
}
