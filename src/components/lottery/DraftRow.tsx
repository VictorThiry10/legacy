"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import PendingRow from "@/components/PendingRow";
import type { DraftRowInfo } from "@/lib/draft";
import { gm } from "@/lib/lottery";

const RookiePick = dynamic(() => import("./RookiePick"), { ssr: false });

// The rookie draft's line in the Team page's to-do card (Pending.tsx), until the last pick is made: waiting on the
// GM who is on the clock (checked again every 20 seconds), or my pick. Either way it opens the pick screen, which
// shows the order and who took whom.
export default function DraftRow({ info }: { info: DraftRowInfo }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <PendingRow
        onClick={() => setOpen(true)}
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M10.5 9.5 12 8v8" /></svg>}
        title="Rookie draft"
        sub={info.myTurn ? `Your pick, #${info.slot}` : `Waiting for selection: #${info.onClock.slot} ${gm(info.onClock.team).name}`}
        action={info.myTurn ? "Pick" : undefined}
      />
      {!info.myTurn && !open && <AutoRefresh seconds={20} />}
      {/* on <body>: the page slides, which would trap it */}
      {open &&
        createPortal(
          <RookiePick
            onClose={() => {
              setOpen(false);
              router.refresh();
            }}
          />,
          document.body,
        )}
    </>
  );
}
