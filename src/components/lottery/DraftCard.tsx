"use client";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import PendingRow from "@/components/PendingRow";
import { ME } from "./teams";
import { useDraft } from "./draft";

const RookiePick = dynamic(() => import("./RookiePick"), { ssr: false });

// The Team page's to-do card (Pending.tsx) with the rookie draft's row on top: waiting on the teams ahead, then
// my pick. `children` are the card's other rows, `empty` says there are none. TEST for now (draft.ts): the row
// only shows in the browser that just ran the lottery.
export default function DraftCard({ empty, children }: { empty: boolean; children: ReactNode }) {
  const draft = useDraft(ME);
  const [open, setOpen] = useState(false);
  const row = draft && !draft.d.mine;
  return (
    <>
      {(row || !empty) && (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {row && (
            <PendingRow
              onClick={() => setOpen(true)}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M10.5 9.5 12 8v8" /></svg>}
              title="Rookie draft"
              sub={draft.myTurn ? `Your pick, #${draft.myPick}` : `Waiting for selection: #${draft.onClock} ${draft.d.order[draft.onClock - 1]?.name}`}
              action={draft.myTurn ? "Pick" : undefined}
            />
          )}
          {children}
        </div>
      )}
      {/* on <body>: the page slides, which would trap it */}
      {open && createPortal(<RookiePick onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
