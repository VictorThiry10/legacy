"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { FORWARD } from "../Slide";
import type { CardPlayer, Results as RoundResults, RoomTeam, RoundInfo } from "@/lib/bidding";
import { money } from "@/lib/rules";
import * as A from "@/app/(league)/bidding/actions";
import PlayerCard from "./PlayerCard";
import Portal from "./Portal";
import { TimeLeft, When } from "./time";
import { BidStatus, ease, GHOST, Gm, Pill, reasonText, roundName } from "./ui";

// A round's results: who signed whom and every other bid. While the renounce window is open (`canRenounce`) my
// signings have Renounce and the heading counts down to the deadline; `next` is the round after, so GMs know
// when to come back. `past`: a finished round, shown under the next one.
export default function Results({ results, teams, me, skew, serverNow, canRenounce, next, past = false, onReplay }: {
  results: RoundResults; teams: RoomTeam[]; me: RoomTeam; skew: number; serverNow: number; canRenounce: boolean; next: RoundInfo | null; past?: boolean; onReplay: () => void;
}) {
  const { round, items, players } = results;
  const [ask, setAsk] = useState<{ bidId: string; player: CardPlayer } | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? "A team";
  const look = (id: string) => teams.find((t) => t.id === id)?.look ?? null;

  const renounce = () =>
    ask &&
    start(async () => {
      const r = await A.renounce(ask.bidId);
      setErr(r?.error ?? "");
      setAsk(null);
    });

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-semibold">{roundName(round)} results</h2>
        <button onClick={onReplay} className="text-sm font-medium text-muted hover:text-fg">▶ Replay</button>
      </div>
      {!past && (canRenounce || next) && (
        <div className="flex flex-wrap items-center gap-2">
          {canRenounce && round.settlesAt && (
            <Pill tone="crimson">Renounce until <When iso={round.settlesAt} style="time" /> · <TimeLeft iso={round.settlesAt} skew={skew} serverNow={serverNow} /></Pill>
          )}
          {next && <Pill>{roundName(next)} {next.opensAt ? <>· <When iso={next.opensAt} /></> : "· starting soon"}</Pill>}
        </div>
      )}
      {err && <p className="text-sm text-bad">{err}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => {
          const p = players.find((x) => x.id === item.playerId);
          if (!p) return null;
          const w = item.winner;
          const mine = w?.teamId === me.id;
          const others = item.bids.filter((b) => b.status !== "won");
          return (
            <motion.div
              key={`${item.playerId}:${w?.bidId ?? "none"}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3, ease }}
              className={`flex min-w-0 gap-3 rounded-2xl border bg-card p-3 ${mine ? "border-crimson/40" : "border-line"}`}
            >
              <Link href={`/players/${p.id}`} transitionTypes={FORWARD} className="w-[4.5rem] shrink-0 active:opacity-80">
                <PlayerCard p={p} size="thumb" className={w ? "" : "grayscale opacity-60"} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/players/${p.id}`} transitionTypes={FORWARD} className="block truncate font-semibold">{p.name}</Link>
                {w ? (
                  <>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Gm team={look(w.teamId)} size="sm" />
                      <span className="truncate text-sm">{name(w.teamId)}</span>
                    </div>
                    <div className="mt-1.5 text-2xl font-semibold tabular-nums">{money(w.amount)}</div>
                    {w.tie && <div className="text-xs text-muted">{w.tie === "cap" ? "Tie · more cap space" : "Tie · computer pick"}</div>}
                  </>
                ) : (
                  <div className="mt-1.5"><Pill>Unsigned</Pill></div>
                )}
                {others.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {others.map((b) => (
                      <li key={b.bidId} className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                        <BidStatus status={b.status as "lost" | "voided" | "renounced"} />
                        <span className="truncate">{name(b.teamId)} · {money(b.amount)}{b.status === "voided" && ` · ${reasonText(b.reason)}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {canRenounce && mine && me.renouncesLeft > 0 && (
                  <button onClick={() => setAsk({ bidId: w.bidId, player: p })} className={`${GHOST} mt-2 h-8 px-3 text-xs`}>
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
              <motion.div className="fixed inset-0 z-50 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAsk(null)} />
              <motion.div
                role="dialog"
                className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-2xl bg-card p-6 text-center shadow-2xl"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease }}
              >
                <div className="mx-auto w-20"><PlayerCard p={ask.player} size="thumb" /></div>
                <h3 className="mt-4 text-lg font-semibold">Renounce {ask.player.name.split(" ").slice(-1)[0]}?</h3>
                <p className="mt-1 text-sm text-muted">He goes to the next highest bidder. {me.renouncesLeft - 1} left after this.</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button onClick={() => setAsk(null)} className={`${GHOST} py-3 font-semibold`}>Keep him</button>
                  <button disabled={pending} onClick={renounce} className="rounded-full bg-bad-fill py-3 font-semibold text-white disabled:opacity-60">
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
