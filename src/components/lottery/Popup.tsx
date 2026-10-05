"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { LotteryTeam } from "@/lib/lottery";

// Loaded on its own and only in the browser: the show (drum, motion) stays out of the league pages.
const Lottery = dynamic(() => import("./Lottery"), { ssr: false });

// The rookie lottery pop-up: opens over the league app until the GM has watched the lottery (lib/draft.ts).
// Closing it refreshes the page under it: the Team page then shows the draft's row.
export default function LotteryPopup({ field }: { field: LotteryTeam[] }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  if (!open) return null;
  return (
    <Lottery
      field={field}
      onClose={() => {
        setOpen(false);
        router.refresh();
      }}
    />
  );
}
