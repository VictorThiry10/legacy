"use client";
import { useState, useTransition } from "react";
import { motion, useDragControls } from "motion/react";
import type { CardPlayer } from "@/lib/bidding";
import { money } from "@/lib/rules";
import * as A from "@/app/bidding/actions";
import PlayerCard from "./PlayerCard";
import { ease } from "./ui";

const STEP = 100_000; // $0.1m

// Slides up from the bottom: pick an amount (buttons, slider or type it), place or take back the bid.
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

  const set = (v: number) => {
    setText(null);
    setErr("");
    setAmt(clamp(v));
  };
  const send = (value: number | null) =>
    start(async () => {
      const r = await A.bid(roundId, player.id, value === null ? null : value / 1e6);
      if (r?.error) setErr(r.error);
      else onClose();
    });
  const pct = max > min ? ((amt - min) / (max - min)) * 100 : 100;

  return (
    <>
      <motion.div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        role="dialog"
        aria-label={`Bid on ${player.name}`}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-[28px] border border-white/10 bg-[#111118] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-30px_80px_-20px_rgba(0,0,0,0.8)]"
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
        <div className="-mx-5 -mt-3 mb-1 flex h-7 cursor-grab touch-none items-center justify-center" onPointerDown={(e) => drag.start(e)}>
          <div className="h-1.5 w-10 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center gap-4">
          <motion.div className="w-24 shrink-0" initial={{ rotate: -6, y: 10, opacity: 0 }} animate={{ rotate: -3, y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.5, ease }}>
            <PlayerCard p={player} />
          </motion.div>
          <div className="min-w-0">
            <div className="font-display text-4xl leading-[0.9]">{player.name}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.2em] text-white/50">{[player.position, player.nbaTeam].filter(Boolean).join(" · ")}</div>
            {player.stats && (
              <div className="mt-2 text-xs text-white/60">
                <span className="text-[var(--gold)]">{player.stats.fppg.toFixed(1)} fpts</span> · {player.stats.ppg.toFixed(1)} pts · {player.stats.rpg.toFixed(1)} reb · {player.stats.apg.toFixed(1)} ast
              </div>
            )}
          </div>
        </div>

        {canBid ? (
          <>
            <label className="mt-6 flex items-baseline justify-center whitespace-nowrap">
              <span className="sr-only">Bid in millions</span>
              <span className="font-display pointer-events-none text-7xl leading-none text-[var(--gold)]">$</span>
              <input
                value={text ?? (amt / 1e6).toFixed(1)}
                inputMode="decimal"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
                onBlur={() => text !== null && set(Number(text) * 1e6 || min)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                style={{ width: `${Math.max(1.2, [...(text ?? (amt / 1e6).toFixed(1))].reduce((w, c) => w + (c === "." ? 0.17 : 0.39), 0.04))}em` }}
                className="font-display bg-transparent text-center text-7xl leading-none text-[var(--gold)] outline-none"
              />
              <span className="font-display pointer-events-none text-7xl leading-none text-[var(--gold)]">M</span>
            </label>
            <div className="mt-4 grid grid-cols-4 gap-2">
              <Step label="−1" onClick={() => set(amt - 1e6)} />
              <Step label="−0.1" onClick={() => set(amt - STEP)} />
              <Step label="+0.1" onClick={() => set(amt + STEP)} />
              <Step label="+1" onClick={() => set(amt + 1e6)} />
            </div>
            <input
              type="range" min={min} max={max} step={STEP} value={amt}
              onChange={(e) => set(Number(e.target.value))}
              className="bid-range mt-6 w-full"
              style={{ "--p": `${pct}%` } as React.CSSProperties}
              aria-label="Bid amount"
            />
            <div className="mt-2 flex justify-between text-[11px] text-white/45">
              <button onClick={() => set(min)}>Min {money(min)}</button>
              <button onClick={() => set(max)}>Max {money(max)}</button>
            </div>
            <button
              disabled={pending}
              onClick={() => send(text !== null ? clamp(Number(text) * 1e6 || min) : amt)}
              className="gold-btn mt-6 h-14 w-full rounded-2xl text-lg font-bold transition active:scale-[0.98] disabled:opacity-60"
            >
              {pending ? "Saving…" : current !== undefined ? `Update bid · ${money(text !== null ? clamp(Number(text) * 1e6 || min) : amt)}` : `Place bid · ${money(amt)}`}
            </button>
          </>
        ) : (
          <p className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">Your roster is full.</p>
        )}
        {current !== undefined && (
          <button disabled={pending} onClick={() => send(null)} className="mt-3 h-11 w-full rounded-2xl text-sm font-semibold text-white/60 hover:text-white">
            Take back my bid
          </button>
        )}
        {err && <p className="mt-2 text-center text-sm text-[var(--bad)]">{err}</p>}
      </motion.div>
    </>
  );
}

function Step({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-11 rounded-full border border-white/15 bg-white/5 text-sm font-semibold transition active:scale-95 active:bg-white/15">
      {label}
    </button>
  );
}
