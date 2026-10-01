"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Reloads the page data every few seconds (live scores), and right away when the app comes back on screen.
export default function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    // Only while the app is on screen; coming back to it refreshes straight away.
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), seconds * 1000);
    const back = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [router, seconds]);
  return null;
}
