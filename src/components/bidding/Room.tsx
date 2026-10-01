"use client";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useSpring } from "motion/react";
import type { CardPlayer, Room as Data, RoomTeam } from "@/lib/bidding";
import { money, ROUND_SECONDS } from "@/lib/rules";
import TeamAvatar from "@/components/TeamAvatar";
import * as A from "@/app/bidding/actions";
import PlayerCard, { CardBack } from "./PlayerCard";
import BidSheet from "./BidSheet";
import RevealShow from "./RevealShow";
import Results from "./Results";
import Contracts from "./Contracts";
import { useNow } from "./clock";
import Portal from "./Portal";
import { ease, Kicker, roundName } from "./ui";

// The live bidding room. One page that changes with the round: waiting, bidding (cards and a clock), the reveal,
// then contract lengths. Polls a tiny fingerprint every 2 seconds and refreshes when anything moves.
export default function Room({ data, me: who }: { data: Data; me: { id: string; name: string } }) {
  const skew = usePulse();
  const me = data.teams.find((t) => t.id === data.meId) ?? { ...who, manager: null, capSpace: 0, maxBid: 0, roster: 0, renouncesLeft: 0, hasBid: false };
  const [open, setOpen] = useState<CardPlayer | null>(null);
  return (
    <>
      <Header data={data} me={me} />
      <AnimatePresence mode="wait">
        <motion.div
          key={`${data.phase}:${data.round?.id ?? ""}`}
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
          transition={{ duration: 0.5, ease }}
        >
          {data.phase === "waiting" && <Waiting data={data} />}
          {data.phase === "bidding" && <Bidding data={data} me={me} skew={skew} onOpen={setOpen} />}
          {data.phase === "reveal" && <RevealPhase data={data} me={me} />}
          {(data.phase === "contracts" || data.phase === "done") && <Contracts data={data} />}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {open && data.phase === "bidding" && data.round && (
          <BidSheet key={open.id} player={open} roundId={data.round.id} current={data.myBids[open.id]} max={me.maxBid} min={data.minSalary} onClose={() => setOpen(null)} />
        )}
      </AnimatePresence>
      <footer className={`mx-auto max-w-5xl px-4 pt-6 text-center text-xs text-white/35 ${data.isCommish ? "pb-32" : "pb-10"}`}>
        {me.name} ·{" "}
        <form action={A.signOut} className="inline">
          <button className="underline underline-offset-2 hover:text-white/70">Sign out</button>
        </form>
      </footer>
      {data.isCommish && <CommishBar data={data} />}
    </>
  );
}

// Polls the room's fingerprint; refreshes the page when it changes. Also learns how far this clock is from the server's.
function usePulse() {
  const router = useRouter();
  const [skew, setSkew] = useState(0);
  useEffect(() => {
    let last = "", alive = true, busy = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (busy) return;
      busy = true;
      clearTimeout(t);
      try {
        if (document.visibilityState === "visible") {
          const sent = Date.now();
          const j = (await (await fetch("/api/bidding/pulse", { cache: "no-store" })).json()) as { v: string; now: number };
          const s = j.now - (sent + Date.now()) / 2;
          if (alive) setSkew((old) => (Math.abs(old - s) > 300 ? s : old));
          if (alive && last && j.v !== last) router.refresh();
          last = j.v;
        }
      } catch {
        // offline for a moment: try again next tick
      }
      busy = false;
      if (alive) t = setTimeout(tick, 2000);
    };
    tick();
    const wake = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [router]);
  return skew;
}

function Header({ data, me }: { data: Data; me: RoomTeam }) {
  return (
    <header className="glass sticky top-0 z-30 border-b border-white/10 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <div className="font-display text-[26px] leading-none">
          <span className="gold-text">Legacy</span>
          <span className="ml-2 text-white/40">Free agency</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right leading-none">
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/45">Cap space</div>
            <div className="font-display mt-1 text-[22px] text-[var(--gold)]">{money(me.capSpace)}</div>
          </div>
          <TeamAvatar name={me.name} size="sm" />
        </div>
      </div>
      {data.rounds.length > 0 && (
        <div className="mx-auto flex max-w-5xl gap-1 px-4 pb-2">
          {data.rounds.map((r) => (
            <div key={r.id} className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10" title={roundName(r)}>
              {r.status === "final" && <motion.div className="absolute inset-0 bg-[var(--gold)]" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ duration: 0.8, ease }} />}
              {r.status === "open" && (
                <motion.div className="absolute inset-0 bg-[var(--crimson)]" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.6, repeat: Infinity }} />
              )}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

function Waiting({ data }: { data: Data }) {
  const next = data.round;
  return (
    <section className="mx-auto max-w-5xl px-4 pt-8">
      <Kicker>{next ? roundName(next) : "Free agency"}</Kicker>
      <h1 className="font-display mt-1 text-6xl leading-[0.85] sm:text-7xl">{next ? "Starting soon" : "Coming soon"}</h1>
      {next && data.cardsWaiting > 0 && (
        <div className="mt-8 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {Array.from({ length: data.cardsWaiting }, (_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: [0, -6, 0] }}
              transition={{ opacity: { delay: i * 0.06 }, y: { duration: 3.6, repeat: Infinity, delay: i * 0.22, ease: "easeInOut" } }}
            >
              <CardBack />
            </motion.div>
          ))}
        </div>
      )}
      <Kicker className="mt-10">GMs</Kicker>
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {data.teams.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0 ${t.id === data.meId ? "bg-[var(--gold)]/[0.06]" : ""}`}>
            <TeamAvatar name={t.name} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-semibold">{t.name}</div>
              <div className="truncate text-xs text-white/45">{t.manager ?? ""}</div>
            </div>
            <div className="text-right leading-tight">
              <div className="font-display text-xl text-[var(--gold)]">{money(t.capSpace)}</div>
              <div className="text-[10px] uppercase tracking-widest text-white/40">{t.roster} players</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Bidding({ data, me, skew, onOpen }: { data: Data; me: RoomTeam; skew: number; onOpen: (p: CardPlayer) => void }) {
  const router = useRouter();
  const now = useNow(data.now) + skew;
  const closes = Date.parse(data.round?.closesAt ?? "");
  const left = Math.max(0, closes - now);
  const ended = left <= 0;
  // Time's up: refresh until the server agrees and sends the reveal.
  useEffect(() => {
    if (!ended) return;
    const t = setInterval(() => router.refresh(), 1500);
    const first = setTimeout(() => router.refresh(), 400);
    return () => {
      clearInterval(t);
      clearTimeout(first);
    };
  }, [ended, router]);

  const bids = Object.values(data.myBids);
  const total = bids.reduce((a, b) => a + b, 0);
  const regular = data.rounds.filter((r) => r.kind === "regular").length;
  return (
    <section className="mx-auto max-w-5xl px-4 pt-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Kicker>{data.round?.kind === "leftovers" ? "Everyone nobody bid on" : `Round ${data.round?.number} of ${regular}`}</Kicker>
          <h1 className="font-display mt-1 text-6xl leading-[0.85]">{data.round?.kind === "leftovers" ? "Last chance" : `Round ${data.round?.number}`}</h1>
        </div>
        <Countdown left={left} />
      </div>
      <TimeBar left={left} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Chip label="Max bid" value={money(me.maxBid)} />
        <Chip label={bids.length === 1 ? "1 bid" : `${bids.length} bids`} value={money(total)} warn={total > me.capSpace} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Kicker>Bids in</Kicker>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {data.teams.map((t) => (
              <motion.div key={t.id} title={t.name} animate={{ opacity: t.hasBid ? 1 : 0.3, scale: t.hasBid ? 1 : 0.9 }} className={`rounded-full ring-2 ${t.hasBid ? "ring-[var(--gold)]" : "ring-[#07070b]"}`}>
                <TeamAvatar name={t.name} size="sm" />
              </motion.div>
            ))}
          </div>
          <span className="text-xs tabular-nums text-white/50">{data.teams.filter((t) => t.hasBid).length}/{data.teams.length}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.players.map((p, i) => (
          <DealtCard key={p.id} p={p} i={i} bid={data.myBids[p.id]} onClick={() => onOpen(p)} />
        ))}
      </div>

      <Portal>
        <AnimatePresence>{ended && <Locked />}</AnimatePresence>
      </Portal>
    </section>
  );
}

function Countdown({ left }: { left: number }) {
  const secs = Math.ceil(left / 1000);
  const mm = Math.floor(secs / 60), ss = secs % 60;
  const tone = secs <= 10 ? "text-[var(--crimson)]" : secs <= 30 ? "text-amber-300" : "text-white";
  return (
    <motion.div key={secs <= 10 ? secs : "calm"} initial={secs <= 10 ? { scale: 1.12 } : false} animate={{ scale: 1 }} transition={{ duration: 0.4, ease }} className="text-right">
      <div className={`font-display flex justify-end text-6xl leading-[0.85] transition-colors duration-500 ${tone}`}>
        <Digit d={mm} />
        <span className="px-0.5 opacity-60">:</span>
        <Digit d={Math.floor(ss / 10)} />
        <Digit d={ss % 10} />
      </div>
      <Kicker className="mt-1.5 !tracking-[0.25em]">left to bid</Kicker>
    </motion.div>
  );
}

function Digit({ d }: { d: number }) {
  return (
    <span className="relative inline-block h-[0.85em] w-[0.5em] overflow-hidden text-center">
      <AnimatePresence initial={false}>
        <motion.span
          key={d}
          className="absolute inset-x-0 top-0"
          initial={{ y: "-90%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "90%", opacity: 0 }}
          transition={{ duration: 0.35, ease }}
        >
          {d}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function TimeBar({ left }: { left: number }) {
  const pct = Math.min(100, (left / (ROUND_SECONDS * 1000)) * 100);
  return (
    <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-[width,background-color] duration-300 ease-linear ${left <= 10_000 ? "bg-[var(--crimson)]" : left <= 30_000 ? "bg-amber-300" : "bg-[var(--gold)]"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Chip({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 rounded-full border px-3.5 py-1.5 ${warn ? "border-amber-300/40 bg-amber-300/10" : "border-white/10 bg-white/[0.04]"}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">{label}</span>
      <span className={`font-display text-lg leading-none ${warn ? "text-amber-300" : ""}`}>{value}</span>
      {warn && <span className="text-[10px] text-amber-300/80">over cap if all win</span>}
    </div>
  );
}

// A card dealt face down that flips over; tilts under the mouse; glows gold once I've bid.
function DealtCard({ p, i, bid, onClick }: { p: CardPlayer; i: number; bid?: number; onClick: () => void }) {
  const rx = useSpring(0, { stiffness: 220, damping: 18 });
  const ry = useSpring(0, { stiffness: 220, damping: 18 });
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="group relative block w-full text-left [perspective:1000px]"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06, duration: 0.5, ease }}
      whileTap={{ scale: 0.96 }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 16);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 16);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
    >
      <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        <motion.div
          className="relative"
          style={{ transformStyle: "preserve-3d" }}
          initial={{ rotateY: 180 }}
          animate={{ rotateY: 0 }}
          transition={{ delay: 0.3 + i * 0.09, duration: 0.8, ease }}
        >
          <div className={`face rounded-[7%/5%] transition-shadow duration-500 ${bid ? "shadow-[0_0_44px_-6px_rgba(245,196,81,0.75)]" : ""}`}>
            <PlayerCard p={p}>
              <AnimatePresence>
                {bid !== undefined && (
                  <motion.div key="mine" className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 rounded-[inherit] ring-2 ring-inset ring-[var(--gold)]" />
                    <motion.div
                      key={bid}
                      initial={{ scale: 0.5, opacity: 0, y: -10 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 380, damping: 18 }}
                      className="gold-btn absolute left-1/2 top-[4.5%] -translate-x-1/2 rounded-full px-[4cqw] py-[1.4cqw] text-center leading-none"
                    >
                      <div className="text-[3.6cqw] font-bold tracking-[0.2em]">YOUR BID</div>
                      <div className="font-display mt-[0.6cqw] text-[9cqw] leading-none">{money(bid)}</div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </PlayerCard>
          </div>
          <div className="face absolute inset-0 [transform:rotateY(180deg)]">
            <CardBack />
          </div>
        </motion.div>
      </motion.div>
    </motion.button>
  );
}

function Locked() {
  return (
    <motion.div className="fixed inset-0 z-50 grid touch-none place-items-center bg-black/70 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        initial={{ scale: 2.4, opacity: 0, rotate: -18 }}
        animate={{ scale: 1, opacity: 1, rotate: -8 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="font-display rounded-2xl border-[5px] border-[var(--crimson)] px-8 py-3 text-7xl leading-none text-[var(--crimson)] shadow-[0_0_80px_-10px_rgba(255,77,106,0.6)]"
      >
        Bids locked
      </motion.div>
    </motion.div>
  );
}

// ---------- the reveal ----------

const seenSubs = new Set<() => void>();
const seenKey = (round: string) => `bid-reveal-seen:${round}`;
function readSeen(round: string) {
  try {
    return localStorage.getItem(seenKey(round)) === "1";
  } catch {
    return true;
  }
}
function markSeen(round: string) {
  try {
    localStorage.setItem(seenKey(round), "1");
  } catch {
    // private mode: the show simply plays again next time
  }
  seenSubs.forEach((f) => f());
}

function RevealPhase({ data, me }: { data: Data; me: RoomTeam }) {
  const round = data.round!.id;
  const seen = useSyncExternalStore(
    (cb) => {
      seenSubs.add(cb);
      return () => seenSubs.delete(cb);
    },
    () => readSeen(round),
    () => true,
  );
  const [replay, setReplay] = useState(false);
  return (
    <>
      <Results data={data} me={me} onReplay={() => setReplay(true)} />
      <Portal>
        <AnimatePresence>
          {(!seen || replay) && (
            <RevealShow
            key="show"
            data={data}
            onDone={() => {
              markSeen(round);
              setReplay(false);
            }}
          />
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}

// ---------- commissioner ----------

function CommishBar({ data }: { data: Data }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const act = (fn: () => Promise<{ error?: string } | void>, ask?: string) => () => {
    if (ask && !window.confirm(ask)) return;
    setErr("");
    start(async () => {
      const r = await fn();
      if (r?.error) setErr(r.error);
    });
  };
  const nextSetup = data.rounds.find((r) => r.status === "setup");
  const btn = "rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-50";
  return (
    <div className="glass fixed inset-x-0 bottom-0 z-40 border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3">
        <Link href="/bidding/setup" className={`${btn} border border-white/15 text-white/80`}>Rounds</Link>
        <div className="ml-auto flex items-center gap-2">
          {data.phase === "waiting" && data.round && (
            <button disabled={pending} onClick={act(A.startNext)} className={`${btn} gold-btn`}>Start {roundName(data.round).toLowerCase()}</button>
          )}
          {data.phase === "bidding" && (
            <>
              <button disabled={pending} onClick={act(A.addMinute)} className={`${btn} border border-white/15`}>+1 min</button>
              <button disabled={pending} onClick={act(A.revealNow, "Close bidding now for everyone?")} className={`${btn} gold-btn`}>Reveal now</button>
            </>
          )}
          {data.phase === "reveal" && (
            <button disabled={pending} onClick={act(A.nextRound, "Sign the winners and move on?")} className={`${btn} gold-btn`}>
              {nextSetup ? `Start round ${nextSetup.number}` : data.round?.kind === "regular" ? "Next round" : "Finish"}
            </button>
          )}
          {data.phase === "contracts" && (
            <button disabled={pending} onClick={act(() => A.lockContracts(true), "Lock everyone's contract lengths?")} className={`${btn} gold-btn`}>Lock contracts</button>
          )}
          {data.phase === "done" && (
            <button disabled={pending} onClick={act(() => A.lockContracts(false))} className={`${btn} border border-white/15`}>Unlock contracts</button>
          )}
        </div>
        {err && <p className="basis-full text-right text-xs text-[var(--bad)]">{err}</p>}
      </div>
    </div>
  );
}
