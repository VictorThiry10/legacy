"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { FORWARD } from "../Slide";
import type { CardPlayer } from "@/lib/bidding";
import { headshot } from "@/lib/names";
import { BID_STEP, money } from "@/lib/rules";

const STEP = BID_STEP; // whole millions

// A sheet from the bottom, like the app's: the amount (type it, slide it or nudge it), then place or take back
// the bid. onBid (dollars, or null to take it back) closes the sheet straight away: the room shows the bid at
// once and puts it back, with a message, if the server says no.
export default function BidSheet({ player, current, max, min, onClose, onBid }: {
  player: CardPlayer; current?: number; max: number; min: number; onClose: () => void; onBid: (amount: number | null) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / STEP) * STEP));
  const [amt, setAmt] = useState(() => clamp(current ?? min));
  const [text, setText] = useState<string | null>(null); // while typing
  const canBid = max >= min;
  const value = text !== null ? clamp(Number(text) * 1e6 || min) : amt;
  const shown = text ?? String(amt / 1e6);
  const face = headshot(player.headshot, 150);

  const set = (v: number) => {
    setText(null);
    setAmt(clamp(v));
  };

  return (
    <>
      <motion.div className="fixed inset-0 z-50 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        role="dialog"
        aria-label={`Bid on ${player.name}`}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:bottom-6 sm:rounded-2xl"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        <div className="flex items-center gap-3">
          {/* his page in Players */}
          <Link href={`/players/${player.id}`} transitionTypes={FORWARD} className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70">
            {face && <img src={face} alt="" decoding="async" className="h-12 w-12 shrink-0 rounded-full bg-line object-cover object-top" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold">{player.name}</div>
              <div className="truncate text-xs text-muted">
                {[player.position?.replace(/,\s*/g, "/"), player.nbaTeam, player.stats && `${player.stats.fppg.toFixed(1)} fpts`].filter(Boolean).join(" · ")}
              </div>
            </div>
          </Link>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted">✕</button>
        </div>

        {canBid ? (
          <>
            <div className="mt-6 flex items-center justify-between">
              <Nudge label="−" onClick={() => set(value - STEP)} />
              <label className="flex items-baseline whitespace-nowrap text-5xl font-semibold tabular-nums">
                <span className="sr-only">Bid in millions</span>
                <span className="text-muted">$</span>
                <input
                  value={shown}
                  inputMode="numeric"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => text !== null && set(Number(text) * 1e6 || min)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  style={{ width: `${Math.max(1, shown.length * 0.62 + 0.1)}em` }}
                  className="bg-transparent text-center outline-none"
                />
                <span className="text-muted">m</span>
              </label>
              <Nudge label="+" onClick={() => set(value + STEP)} />
            </div>
            <input
              type="range" min={min} max={max} step={STEP} value={amt}
              onChange={(e) => set(Number(e.target.value))}
              className="mt-6 w-full accent-crimson"
              aria-label="Bid amount"
            />
            <div className="mt-1 flex justify-between text-xs text-muted">
              <button onClick={() => set(min)} className="hover:text-fg">{money(min)}</button>
              <button onClick={() => set(max)} className="hover:text-fg">Max {money(max)}</button>
            </div>
            <button onClick={() => onBid(value)} className="mt-6 w-full rounded-full bg-crimson py-3 font-semibold text-white transition active:scale-[0.98]">
              {current !== undefined ? "Update bid" : "Place bid"}
            </button>
          </>
        ) : (
          <p className="mt-6 text-center text-sm text-muted">Your roster is full.</p>
        )}
        {current !== undefined && (
          <button onClick={() => onBid(null)} className="mt-2 h-10 w-full text-sm text-muted hover:text-fg">
            Take back my bid
          </button>
        )}
      </motion.div>
    </>
  );
}

function Nudge({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label === "+" ? "Up $1m" : "Down $1m"} className="grid h-11 w-11 place-items-center rounded-full bg-fg/[0.06] text-2xl font-light transition active:scale-90">
      {label}
    </button>
  );
}
