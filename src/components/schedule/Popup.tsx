"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { sawSchedule } from "@/app/(league)/schedule/actions";
import type { Release } from "@/lib/schedule-release";

// Loaded on its own and only in the browser: the show (motion) stays out of the league pages.
const ScheduleRelease = dynamic(() => import("./Release"), { ssr: false });

// The schedule release pop-up: opens over the league app once, the first time a GM comes in after the schedule is
// built (lib/schedule-release.ts). Closing it tells the server, then refreshes the page under it.
export default function SchedulePopup({ data }: { data: Release }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  if (!open) return null;
  return (
    <ScheduleRelease
      data={data}
      onClose={() => {
        setOpen(false);
        sawSchedule().catch(() => null).then(() => router.refresh());
      }}
    />
  );
}
