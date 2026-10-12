"use client";
import { motion } from "motion/react";
import type { CardPlayer } from "@/lib/bidding";
import { headshot } from "@/lib/names";
import { money } from "@/lib/rules";

// A sheet from the bottom, like the bid sheet: my bids this round in order of priority. If they all win and together
// go over the cap, the last ones give way first. Arrows move a bid up or down; every move is saved at once.
export default function PrioritySheet({ order, players, amounts, onMove, onClose }: {
  order: string[]; players: CardPlayer[]; amounts: Record<string, number>; onMove: (playerId: string, dir: -1 | 1) => void; onClose: () => void;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <>
      <motion.div className="fixed inset-0 z-50 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        role="dialog"
        aria-label="Bid priority"
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:bottom-6 sm:rounded-2xl"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">Priority</div>
            <div className="text-xs text-muted">Over the cap if they all win? The last ones give way.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted">✕</button>
        </div>
        <ol className="mt-4 divide-y divide-line">
          {order.map((id, i) => {
            const p = byId.get(id);
            const face = headshot(p?.headshot ?? null, 96);
            return (
              <li key={id} className="flex items-center gap-3 py-2.5">
                <span className="w-5 text-center text-sm font-semibold tabular-nums text-muted">{i + 1}</span>
                {face ? <img src={face} alt="" decoding="async" className="h-10 w-10 shrink-0 rounded-full bg-line object-cover object-top" /> : <span className="h-10 w-10 shrink-0 rounded-full bg-line" />}
                <span className="min-w-0 flex-1 truncate font-medium">{p?.name ?? id}</span>
                <span className="text-sm tabular-nums text-muted">{money(amounts[id] ?? 0)}</span>
                <Arrow label="Up" disabled={i === 0} onClick={() => onMove(id, -1)}>↑</Arrow>
                <Arrow label="Down" disabled={i === order.length - 1} onClick={() => onMove(id, 1)}>↓</Arrow>
              </li>
            );
          })}
        </ol>
      </motion.div>
    </>
  );
}

function Arrow({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-base transition active:scale-90 disabled:opacity-25">
      {children}
    </button>
  );
}
