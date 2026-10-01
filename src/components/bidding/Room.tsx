"use client";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useSpring } from "motion/react";
import type { CardPlayer, Room as Data, RoomTeam } from "@/lib/bidding";
import { money, ROUND_SECONDS } from "@/lib/rules";
import * as A from "@/app/bidding/actions";
import PlayerCard, { CardBack } from "./PlayerCard";
import BidSheet from "./BidSheet";
import RevealShow from "./RevealShow";
import Results from "./Results";
import Contracts from "./Contracts";
import Portal from "./Portal";
import { useNow } from "./clock";
import { ease, Gm, Kicker, Label, roundName } from "./ui";

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
          initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
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
      <footer className={`mx-auto max-w-5xl px-4 pt-8 text-center text-xs text-white/30 ${data.isCommish ? "pb-28" : "pb-10"}`}>
        {me.name} ·{" "}
        <form action={A.signOut} className="inline">
          <button className="hover:text-white/70">Sign out</button>
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
    <header className="glass sticky top-0 z-30 border-b border-white/[0.06] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <div className="font-display text-2xl leading-none">
          Legacy<span className="ml-2 text-white/35">Free agency</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right leading-none">
            <Label>Cap space</Label>
            <div className="font-display mt-1 text-xl">{money(me.capSpace)}</div>
          </div>
          <Gm name={me.name} size="sm" />
        </div>
      </div>
      {data.rounds.length > 0 && (
        <div className="mx-auto flex max-w-5xl gap-1 px-4 pb-2">
          {data.rounds.map((r) => (
            <div key={r.id} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/10" title={roundName(r)}>
              {r.status === "final" && <motion.div className="absolute inset-0 bg-white/60" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ duration: 0.8, ease }} />}
              {r.status === "open" && <motion.div className="absolute inset-0 bg-white" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.8, repeat: Infinity }} />}
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
      <h1 className="font-display mt-1 text-6xl leading-[0.85]">{next ? "Starting soon" : "Coming soon"}</h1>
      {next && data.cardsWaiting > 0 && (
        <div className="mt-8 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {Array.from({ length: data.cardsWaiting }, (_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: [0, -4, 0] }}
              transition={{ opacity: { delay: i * 0.05 }, y: { duration: 4, repeat: Infinity, delay: i * 0.25, ease: "easeInOut" } }}
            >
              <CardBack />
            </motion.div>
          ))}
        </div>
      )}
      <Label className="mt-10">GMs</Label>
      <div className="mt-3 divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {data.teams.map((t) => (
          <div key={t.id} className="flex items-center gap-3 py-3">
            <Gm name={t.name} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className={`truncate text-[15px] ${t.id === data.meId ? "font-semibold" : ""}`}>{t.name}</div>
              <div className="truncate text-xs text-white/40">{t.manager ?? ""}</div>
            </div>
            <div className="text-right leading-tight">
              <div className="font-display text-xl">{money(t.capSpace)}</div>
              <div className="text-[10px] text-white/35">{t.roster} players</div>
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
  const left = Math.max(0, Date.parse(data.round?.closesAt ?? "") - now);
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
  const over = total > me.capSpace;
  const inCount = data.teams.filter((t) => t.hasBid).length;
  const regular = data.rounds.filter((r) => r.kind === "regular").length;
  return (
    <section className="mx-auto max-w-5xl px-4 pt-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Kicker>{data.round?.kind === "leftovers" ? "Nobody bid on these" : `Round ${data.round?.number} of ${regular}`}</Kicker>
          <h1 className="font-display mt-1 text-6xl leading-[0.85]">{data.round?.kind === "leftovers" ? "Last chance" : `Round ${data.round?.number}`}</h1>
        </div>
        <Countdown left={left} />
      </div>
      <div className="mt-4 h-[2px] overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full transition-[width,background-color] duration-300 ease-linear ${left <= 10_000 ? "bg-[var(--crimson)]" : "bg-white/80"}`}
          style={{ width: `${Math.min(100, (left / (ROUND_SECONDS * 1000)) * 100)}%` }}
        />
      </div>

      <div className="mt-5 flex items-end gap-7">
        <div>
          <Label>Max bid</Label>
          <div className="font-display mt-1 text-2xl leading-none">{money(me.maxBid)}</div>
        </div>
        <div>
          <Label>{bids.length === 1 ? "1 bid" : `${bids.length} bids`}</Label>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`font-display text-2xl leading-none ${over ? "text-amber-300" : ""}`}>{money(total)}</span>
            {over && <span className="text-[10px] text-amber-300/70">over cap if all win</span>}
          </div>
        </div>
        <div className="ml-auto text-right">
          <Label>{inCount}/{data.teams.length} in</Label>
          <div className="mt-2 flex justify-end gap-1.5">
            {data.teams.map((t) => (
              <motion.span key={t.id} title={t.name} className="h-1.5 w-1.5 rounded-full" animate={{ backgroundColor: t.hasBid ? "#f5f5f4" : "rgba(255,255,255,0.15)" }} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
  return (
    <div className="text-right">
      <div className={`font-display flex justify-end text-6xl leading-[0.85] transition-colors duration-500 ${secs <= 10 ? "text-[var(--crimson)]" : ""}`}>
        <Digit d={mm} />
        <span className="px-0.5 text-white/30">:</span>
        <Digit d={Math.floor(ss / 10)} />
        <Digit d={ss % 10} />
      </div>
    </div>
  );
}

function Digit({ d }: { d: number }) {
  return (
    <span className="relative inline-block h-[0.85em] w-[0.5em] overflow-hidden text-center">
      <AnimatePresence initial={false}>
        <motion.span key={d} className="absolute inset-x-0 top-0" initial={{ y: "-90%", opacity: 0 }} animate={{ y: "0%", opacity: 1 }} exit={{ y: "90%", opacity: 0 }} transition={{ duration: 0.35, ease }}>
          {d}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// A card dealt face down that flips over and tilts under the mouse.
function DealtCard({ p, i, bid, onClick }: { p: CardPlayer; i: number; bid?: number; onClick: () => void }) {
  const rx = useSpring(0, { stiffness: 220, damping: 18 });
  const ry = useSpring(0, { stiffness: 220, damping: 18 });
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="relative block w-full text-left [perspective:1000px]"
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05, duration: 0.5, ease }}
      whileTap={{ scale: 0.97 }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 12);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 12);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
    >
      <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>
        <motion.div className="relative" style={{ transformStyle: "preserve-3d" }} initial={{ rotateY: 180 }} animate={{ rotateY: 0 }} transition={{ delay: 0.25 + i * 0.08, duration: 0.8, ease }}>
          <div className="face">
            <PlayerCard p={p} bid={bid} />
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
    <motion.div className="fixed inset-0 z-50 grid touch-none place-items-center bg-black/75 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ scale: 1.3, opacity: 0, filter: "blur(10px)" }} animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.6, ease }} className="text-center">
        <div className="font-display text-7xl leading-none">Bids locked</div>
        <Kicker className="mt-3">The reveal is coming</Kicker>
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
  const btn = "h-10 rounded-full px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-40";
  const primary = `${btn} btn-primary`;
  const ghost = `${btn} text-white/70 hover:text-white`;
  return (
    <div className="glass fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-2.5">
        <Link href="/bidding/setup" className={`${ghost} inline-flex items-center`}>Rounds</Link>
        <div className="ml-auto flex items-center gap-1">
          {data.phase === "waiting" && data.round && <button disabled={pending} onClick={act(A.startNext)} className={primary}>Start {roundName(data.round).toLowerCase()}</button>}
          {data.phase === "bidding" && (
            <>
              <button disabled={pending} onClick={act(A.addMinute)} className={ghost}>+1 min</button>
              <button disabled={pending} onClick={act(A.revealNow, "Close bidding now for everyone?")} className={primary}>Reveal now</button>
            </>
          )}
          {data.phase === "reveal" && (
            <button disabled={pending} onClick={act(A.nextRound, "Sign the winners and move on?")} className={primary}>
              {nextSetup ? `Start round ${nextSetup.number}` : data.round?.kind === "regular" ? "Next round" : "Finish"}
            </button>
          )}
          {data.phase === "contracts" && <button disabled={pending} onClick={act(() => A.lockContracts(true), "Lock everyone's contract lengths?")} className={primary}>Lock contracts</button>}
          {data.phase === "done" && <button disabled={pending} onClick={act(() => A.lockContracts(false))} className={ghost}>Unlock contracts</button>}
        </div>
        {err && <p className="basis-full text-right text-xs text-[var(--bad)]">{err}</p>}
      </div>
    </div>
  );
}
