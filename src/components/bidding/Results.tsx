"use client";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { CardPlayer, Room, RoomTeam } from "@/lib/bidding";
import { money } from "@/lib/rules";
import * as A from "@/app/bidding/actions";
import PlayerCard from "./PlayerCard";
import Portal from "./Portal";
import { ease, Gm, Kicker, reasonText, roundName } from "./ui";

// After the reveal: who signed whom, every other bid, and Renounce on my signings until the next round starts.
export default function Results({ data, me, onReplay }: { data: Room; me: RoomTeam; onReplay: () => void }) {
  const [ask, setAsk] = useState<{ bidId: string; player: CardPlayer } | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const name = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "A team";

  const renounce = () =>
    ask &&
    start(async () => {
      const r = await A.renounce(ask.bidId);
      setErr(r?.error ?? "");
      setAsk(null);
    });

  return (
    <section className="mx-auto max-w-5xl px-4 pt-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Kicker>{roundName(data.round)}</Kicker>
          <h1 className="font-display mt-1 text-6xl leading-[0.85]">Results</h1>
        </div>
        <button onClick={onReplay} className="pb-1 text-sm font-medium text-white/55 transition hover:text-white">▶ Replay</button>
      </div>
      {err && <p className="mt-3 text-sm text-[var(--bad)]">{err}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {(data.reveal ?? []).map((item, i) => {
          const p = data.players.find((x) => x.id === item.playerId);
          if (!p) return null;
          const w = item.winner;
          const mine = w?.teamId === me.id;
          const others = item.bids.filter((b) => b.status !== "won");
          return (
            <motion.div
              key={`${item.playerId}:${w?.bidId ?? "none"}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.5, ease }}
              className={`flex gap-4 rounded-2xl p-3 ${mine ? "bg-white/[0.06] ring-1 ring-inset ring-white/15" : "bg-white/[0.025]"}`}
            >
              <div className="w-[5.5rem] shrink-0">
                <PlayerCard p={p} className={w ? "" : "grayscale brightness-75"} />
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <div className="truncate font-semibold">{p.name}</div>
                {w ? (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <Gm name={name(w.teamId)} size="sm" />
                      <span className="truncate text-sm text-white/80">{name(w.teamId)}</span>
                    </div>
                    <div className="font-display mt-1.5 text-4xl leading-none text-[var(--gold)]">{money(w.amount)}</div>
                    {w.tie && <div className="text-[11px] text-white/45">{w.tie === "cap" ? "Tie · more cap space" : "Tie · computer pick"}</div>}
                  </>
                ) : (
                  <div className="mt-2 text-sm text-white/45">{data.round?.kind === "leftovers" ? "Unsigned" : "Unsigned · last chance round"}</div>
                )}
                {others.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-white/40">
                    {others.map((b) => (
                      <li key={b.bidId} className="truncate">
                        <span className="text-white/25">
                          {b.status === "lost" ? "Rejected" : b.status === "voided" ? "Voided" : "Renounced"}
                        </span>{" "}
                        {name(b.teamId)} · {money(b.amount)}
                        {b.status === "voided" && ` · ${reasonText(b.reason)}`}
                      </li>
                    ))}
                  </ul>
                )}
                {mine && me.renouncesLeft > 0 && (
                  <button
                    onClick={() => setAsk({ bidId: w.bidId, player: p })}
                    className="mt-2 text-xs font-medium text-white/50 underline-offset-4 transition hover:text-white hover:underline"
                  >
                    Renounce
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <Portal>
      <AnimatePresence>
        {ask && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAsk(null)} />
            <motion.div
              role="dialog"
              className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-3xl bg-[#141417] p-6 text-center shadow-2xl ring-1 ring-white/10"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25, ease }}
            >
              <div className="mx-auto w-24 -rotate-3"><PlayerCard p={ask.player} /></div>
              <h2 className="font-display mt-5 text-4xl leading-none">Renounce {ask.player.name.split(" ").slice(-1)[0]}?</h2>
              <p className="mt-2 text-sm text-white/60">He goes to the next highest bidder. {me.renouncesLeft - 1} left after this.</p>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button onClick={() => setAsk(null)} className="h-12 rounded-2xl bg-white/[0.06] font-semibold">Keep him</button>
                <button disabled={pending} onClick={renounce} className="btn-primary h-12 rounded-2xl font-semibold disabled:opacity-60">
                  {pending ? "…" : "Renounce"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </Portal>
    </section>
  );
}
