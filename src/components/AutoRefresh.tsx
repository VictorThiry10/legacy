"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Reloads the page data every few seconds so everyone sees the round change live.
export default function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
