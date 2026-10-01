"use client";
import { useEffect } from "react";

// Tells the server this phone's time zone (a cookie), so game times arrive already in local time.
export default function TimeZone() {
  useEffect(() => {
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (!document.cookie.split("; ").includes(`tz=${tz}`)) document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return null;
}
