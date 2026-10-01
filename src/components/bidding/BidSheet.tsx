"use client";
import { useState, useTransition } from "react";
import { motion, useDragControls } from "motion/react";
import type { CardPlayer } from "@/lib/bidding";
import { money } from "@/lib/rules";
import * as A from "@/app/bidding/actions";

const STEP = 100_000; // bids go in $0.1m
const NUDGE = 500_000; // the − and + buttons

// Slides up from the bottom: the amount (type it, slide it or nudge it), then place or take back the bid.
export default function BidSheet({ player, roundId, current, max, min, onClose }: {
  player: CardPlayer; roundId: string; current?: number; max: number; min: number; onClose: () => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / STEP) * STEP));
  const [amt, setAmt] = useState(() => clamp(current ?? min));
  const [text, setText] = useState<string | null>(null); // while typing
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const drag = useDragControls();
  const canBid = max >= min;
  const value = text !== null ? clamp(Number(text) * 1e6 || min) : amt;
  const shown = text ?? (amt / 1e6).toFixed(1);

  const set = (v: number) => {
    setText(null);
    setErr("");
    setAmt(clamp(v));
  };
  const send = (v: number | null) =>
    start(async () => {
      const r = await A.bid(roundId, player.id, v === null ? null : v / 1e6);
      if (r?.error) setErr(r.error);
      else onClose();
    });

  return (
    <>
      <motion.div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        role="dialog"
        aria-label={`Bid on ${player.name}`}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-[28px] border-t border-white/10 bg-[#141417] px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        drag="y"
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, i) => (i.offset.y > 110 || i.velocity.y > 600) && onClose()}
      >
        <div className="-mx-6 mb-3 flex h-6 cursor-grab touch-none items-center justify-center" onPointerDown={(e) => drag.start(e)}>
          <div className="h-1 w-9 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center gap-3">
          {player.headshot && <img src={player.headshot} alt="" className="h-12 w-12 shrink-0 rounded-full bg-white/[0.06] object-cover object-top" />}
          <div className="min-w-0">
            <div className="font-display truncate text-3xl leading-none">{player.name}</div>
            <div className="mt-1 text-xs text-white/45">
              {[player.position?.replace(/,\s*/g, "/"), player.nbaTeam, player.stats && `${player.stats.fppg.toFixed(1)} fpts`].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>

        {canBid ? (
          <>
            <div className="mt-8 flex items-center justify-between">
              <Nudge label="−" onClick={() => set(value - NUDGE)} />
              <label className="flex items-baseline whitespace-nowrap text-[var(--gold)]">
                <span className="sr-only">Bid in millions</span>
                <span className="font-display text-7xl leading-none">$</span>
                <input
                  value={shown}
                  inputMode="decimal"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
                  onBlur={() => text !== null && set(Number(text) * 1e6 || min)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  style={{ width: `${Math.max(1.2, [...shown].reduce((w, c) => w + (c === "." ? 0.17 : 0.39), 0.04))}em` }}
                  className="font-display bg-transparent text-center text-7xl leading-none outline-none"
                />
                <span className="font-display text-7xl leading-none">M</span>
              </label>
              <Nudge label="+" onClick={() => set(value + NUDGE)} />
            </div>
            <input
              type="range" min={min} max={max} step={STEP} value={amt}
              onChange={(e) => set(Number(e.target.value))}
              className="bid-range mt-8 w-full"
              style={{ "--p": `${max > min ? ((amt - min) / (max - min)) * 100 : 100}%` } as React.CSSProperties}
              aria-label="Bid amount"
            />
            <div className="mt-3 flex justify-between text-xs text-white/35">
              <button onClick={() => set(min)} className="hover:text-white/70">{money(min)}</button>
              <button onClick={() => set(max)} className="hover:text-white/70">Max {money(max)}</button>
            </div>
            <button disabled={pending} onClick={() => send(value)} className="btn-primary mt-7 h-14 w-full rounded-2xl text-base font-semibold transition active:scale-[0.98] disabled:opacity-50">
              {pending ? "Saving…" : current !== undefined ? "Update bid" : "Place bid"}
            </button>
          </>
        ) : (
          <p className="mt-8 text-center text-sm text-white/50">Your roster is full.</p>
        )}
        {current !== undefined && (
          <button disabled={pending} onClick={() => send(null)} className="mt-2 h-11 w-full text-sm text-white/45 hover:text-white">
            Take back my bid
          </button>
        )}
        {err && <p className="mt-2 text-center text-sm text-[var(--bad)]">{err}</p>}
      </motion.div>
    </>
  );
}

function Nudge({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label === "+" ? "Up $0.5m" : "Down $0.5m"} className="grid h-12 w-12 place-items-center rounded-full bg-white/[0.06] text-2xl font-light text-white/80 transition active:scale-90 active:bg-white/15">
      {label}
    </button>
  );
}
