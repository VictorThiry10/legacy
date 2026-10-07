"use client";
import { memo, useCallback, useContext, useEffect, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, MotionConfig, PresenceContext, useReducedMotion, useSpring } from "motion/react";
import type { CardPlayer, Results as RoundResults, Room as Data, RoomTeam } from "@/lib/bidding";
import { money } from "@/lib/rules";
import * as A from "@/app/bidding/actions";
import PlayerCard, { CardBack, cardImages } from "./PlayerCard";
import BidSheet from "./BidSheet";
import RevealShow from "./RevealShow";
import Results from "./Results";
import Contracts from "./Contracts";
import Portal from "./Portal";
import { useClock } from "./clock";
import { left, TimeLeft, useSecondsLeft, When } from "./time";
import { ready } from "./preload";
import { ease, Gm, Kicker, Label, roundName } from "./ui";

// The live bidding room. One page that changes with the round: waiting, bidding (cards and a clock), the reveal,
// then contract lengths. Polls a tiny fingerprint every 2 seconds and refreshes when anything moves.
// `app`: signed in to the league app, so the header leads back to it (there's no browser back in the installed app).
export default function Room({ data, me: who, app }: { data: Data; me: { id: string; name: string }; app: boolean }) {
  const router = useRouter();
  const skew = usePulse(data.v);
  const me = data.teams.find((t) => t.id === data.meId) ?? { ...who, manager: null, look: { name: who.name }, capSpace: 0, maxBid: 0, roster: 0, spots: 0, renouncesLeft: 0, hasBid: false };

  // The bid sheet belongs to the round it was opened in: it never shows up again in a later one.
  const [open, setOpen] = useState<{ p: CardPlayer; round: string } | null>(null);
  const roundId = data.round?.id ?? "";
  const onOpen = useCallback((p: CardPlayer) => setOpen({ p, round: roundId }), [roundId]);

  // My bids show at once; if the server says no, the bid goes back to what it was and a message says why.
  const [myBids, showBid] = useOptimistic(data.myBids, (bids, b: { playerId: string; amount: number | null }) => {
    const next = { ...bids };
    if (b.amount === null) delete next[b.playerId];
    else next[b.playerId] = b.amount;
    return next;
  });
  const [, startBid] = useTransition();
  const [toast, setToast] = useState("");
  const placeBid = (round: string, playerId: string, amount: number | null) => {
    setOpen(null);
    setToast("");
    startBid(async () => {
      showBid({ playerId, amount });
      const r = await A.bid(round, playerId, amount === null ? null : amount / 1e6);
      if (r?.error) setToast(r.error);
    });
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Time's up: lock the room and refresh until the server agrees and sends the reveal.
  // This only re-renders the room when the answer flips, not on every tick.
  const closes = data.phase === "bidding" ? Date.parse(data.round?.closesAt ?? "") : NaN;
  const ended = useClock((now) => now + skew >= closes, data.now);
  const locked = data.phase === "bidding" && ended;
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => router.refresh(), 1500);
    const first = setTimeout(() => router.refresh(), 400);
    return () => {
      clearInterval(t);
      clearTimeout(first);
    };
  }, [locked, router]);

  // The results there are to watch: the live round's during its renounce window, else the round that just finished
  // (for a GM who opens the site after the window closed). The reveal show lives here, outside the page that
  // changes with the phase, so moving on fades it out instead of cutting it. The first time through, the live
  // results wait underneath until it's over.
  const results: RoundResults | null = data.phase === "reveal" && data.round && data.reveal ? { round: data.round, items: data.reveal, players: data.players } : data.last;
  const revealRound = results?.round.id ?? null;
  const seen = useSeen(revealRound);
  const [replay, setReplay] = useState<string | null>(null); // the round being replayed
  const replaying = revealRound !== null && replay === revealRound;
  // It plays by itself the first time, except over a round that's open for bids (there it's one tap away).
  const showing = revealRound !== null && ((seen === false && data.phase !== "bidding") || replaying);
  const showDone = () => {
    if (revealRound) markSeen(revealRound);
    setReplay(null);
  };
  const onReplay = () => setReplay(revealRound);
  // The rounds run by the clock: the commissioner only has something to press at the very end (locking contracts).
  const bar = data.isCommish && (data.phase === "contracts" || data.phase === "done");

  return (
    <MotionConfig reducedMotion="user">
      <Header data={data} me={me} app={app} />
      {/* A cold open shows the room straight away; only the reveal fades in (it sits under the show). */}
      <AnimatePresence mode="wait" initial={data.phase === "reveal"} onExitComplete={() => window.scrollTo({ top: 0, behavior: "instant" })}>
        <motion.div
          key={`${data.phase}:${data.round?.id ?? ""}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5, ease }}
        >
          {data.phase === "waiting" && <Waiting data={data} me={me} skew={skew} onReplay={onReplay} />}
          {data.phase === "bidding" && <Bidding data={data} me={me} myBids={myBids} skew={skew} onOpen={onOpen} onReplay={onReplay} />}
          {data.phase === "reveal" && results && (seen || replaying) && (
            <Results results={results} teams={data.teams} me={me} skew={skew} serverNow={data.now} canRenounce={data.canRenounce} onReplay={onReplay} />
          )}
          {(data.phase === "contracts" || data.phase === "done") && <Contracts data={data} />}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {open && data.phase === "bidding" && open.round === data.round?.id && (
          <BidSheet
            key={open.p.id}
            player={open.p}
            current={myBids[open.p.id]}
            max={me.maxBid}
            min={data.minSalary}
            onClose={() => setOpen(null)}
            onBid={(amount) => placeBid(open.round, open.p.id, amount)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            onClick={() => setToast("")}
            className={`fixed inset-x-0 z-[45] mx-auto w-fit max-w-[calc(100%-2rem)] rounded-full bg-[#1c1c20] px-4 py-2 text-center text-sm text-[var(--bad)] shadow-lg ring-1 ring-white/10 ${bar ? "bottom-24" : "bottom-[max(1.25rem,env(safe-area-inset-bottom))]"}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <Portal>
        <AnimatePresence>{locked && <Locked key="locked" />}</AnimatePresence>
        <AnimatePresence>{showing && results && <RevealShow key="show" results={results} teams={data.teams} meId={data.meId} onDone={showDone} />}</AnimatePresence>
      </Portal>
      {/* room under the commissioner's bar; sign out only for the email sign in (the app has its own) */}
      <footer className={`mx-auto max-w-5xl px-4 pt-8 text-center text-xs text-white/30 ${bar || data.needsLeagueLogin ? "pb-28" : "pb-10"}`}>
        {!app && (
          <form action={A.signOut}>
            <button className="hover:text-white/70">Sign out</button>
          </form>
        )}
      </footer>
      {bar && <CommishBar data={data} />}
      {data.needsLeagueLogin && (
        <div className="glass fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 text-sm">
            <span className="text-white/55">Commissioner controls need the league app login.</span>
            <a href="/login" className="btn-primary ml-auto h-10 shrink-0 rounded-full px-4 font-semibold leading-10">Sign in</a>
          </div>
        </div>
      )}
    </MotionConfig>
  );
}

// Polls the room's fingerprint and refreshes the page when it differs from the one on screen (and that refresh
// wasn't already asked for), so nothing is missed between the page loading and the first poll, and my own
// moves (which refresh the page themselves) don't refresh it twice. Also learns how far this clock is from the server's.
function usePulse(v: string) {
  const router = useRouter();
  const [skew, setSkew] = useState(0);
  const shown = useRef(v);
  useEffect(() => {
    shown.current = v;
  }, [v]);
  useEffect(() => {
    let alive = true, busy = false, requested = "", best = Infinity;
    let t: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (busy) return;
      busy = true;
      clearTimeout(t);
      try {
        if (document.visibilityState === "visible") {
          const t0 = Date.now();
          const j = (await (await fetch("/api/bidding/pulse", { cache: "no-store" })).json()) as { v: string; t1: number; t2: number };
          const t3 = Date.now();
          // NTP style: the network time is the round trip minus the server's own time. Only trust samples about
          // as quick as the best one seen (which slowly relaxes, in case the network got slower for good).
          const rtt = t3 - t0 - (j.t2 - j.t1);
          const offset = (j.t1 - t0 + (j.t2 - t3)) / 2;
          best = Math.min(best + 2, rtt);
          if (alive && rtt <= best + 50) setSkew((old) => (Math.abs(old - offset) > 150 ? offset : old));
          if (alive && j.v !== shown.current && j.v !== requested) {
            requested = j.v;
            router.refresh();
          }
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

function Header({ data, me, app }: { data: Data; me: RoomTeam; app: boolean }) {
  const reduce = useReducedMotion();
  return (
    <header className="glass sticky top-0 z-30 border-b border-white/[0.06] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        {app && (
          <Link href="/team" aria-label="Back to the league" className="-ml-2 -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/55 transition hover:bg-white/[0.06] hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
          </Link>
        )}
        <div className="font-display text-2xl leading-none">Auction</div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right leading-none">
            <Label>Cap space</Label>
            <div className="font-display mt-1 text-xl">{money(me.capSpace)}</div>
          </div>
          {data.isCommish ? (
            // the commissioner's way to the Rounds page (which players come up when)
            <Link href="/bidding/setup" aria-label="Rounds" className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.07] text-white/70 ring-1 ring-inset ring-white/10 transition hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
            </Link>
          ) : (
            <Gm team={me.look} size="sm" />
          )}
        </div>
      </div>
      {data.rounds.length > 0 && (
        <div className="mx-auto flex max-w-5xl gap-1 px-4 pb-2">
          {data.rounds.map((r) => (
            <div key={r.id} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/10" title={roundName(r)}>
              {r.status === "final" && <motion.div className="absolute inset-0 bg-white/60" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ duration: 0.8, ease }} />}
              {/* the live round pulses, or stays lit when the device asks for less motion */}
              {r.status === "open" && <motion.div className="absolute inset-0 bg-white" animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.8, repeat: Infinity }} />}
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

// Between rounds: when the next one opens (in my own time zone, with a countdown), its cards face down, the round
// that just finished, and everyone's cap space.
function Waiting({ data, me, skew, onReplay }: { data: Data; me: RoomTeam; skew: number; onReplay: () => void }) {
  const next = data.round;
  return (
    <section className="mx-auto max-w-5xl px-4 pt-8">
      <Kicker>{next ? `${roundName(next)} opens` : "Auction"}</Kicker>
      <h1 className="font-display mt-1 min-h-[0.85em] text-6xl leading-[0.85]">{next?.opensAt ? <When iso={next.opensAt} /> : "Soon"}</h1>
      {next?.opensAt && (
        <div className="font-display mt-2 text-2xl leading-none text-white/45">
          <TimeLeft iso={next.opensAt} skew={skew} serverNow={data.now} />
        </div>
      )}
      {/* the rounds to come, with their players: the next one first (its time is in the heading) */}
      {data.upcoming.map(({ round, players }, i) => (
        <div key={round.id} className={i ? "mt-8" : "mt-6"}>
          {i > 0 && (
            <div className="flex items-baseline justify-between">
              <Label>{roundName(round)}</Label>
              {round.opensAt && <Label><When iso={round.opensAt} /></Label>}
            </div>
          )}
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {players.map((p, k) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(k, 8) * 0.04, duration: 0.4, ease }}>
                <PlayerCard p={p} size="thumb" />
              </motion.div>
            ))}
          </div>
        </div>
      ))}
      {data.last && <Results past results={data.last} teams={data.teams} me={me} skew={skew} serverNow={data.now} canRenounce={false} onReplay={onReplay} />}
    </section>
  );
}

function Bidding({ data, me, myBids, skew, onOpen, onReplay }: {
  data: Data; me: RoomTeam; myBids: Record<string, number>; skew: number; onOpen: (p: CardPlayer) => void; onReplay: () => void;
}) {
  const closes = Date.parse(data.round?.closesAt ?? "");
  const total = Math.max(1, (closes - Date.parse(data.round?.opensAt ?? "")) / 1000 || 1); // the round's length, in seconds
  // The cards flip once their photos and logos are decoded (1.2 s at most), never onto a blank face.
  const photos = data.players.flatMap((p) => Object.values(cardImages(p, "large"))).join("\n");
  const [go, setGo] = useState(false);
  useEffect(() => {
    let alive = true;
    ready(photos.split("\n"), 1200).then(() => alive && setGo(true));
    return () => {
      alive = false;
    };
  }, [photos]);

  const bids = Object.values(myBids);
  const sum = bids.reduce((a, b) => a + b, 0);
  const over = sum > me.capSpace;
  return (
    <section className="mx-auto max-w-5xl px-4 pt-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="font-display text-6xl leading-[0.85]">{data.round?.kind === "leftovers" ? "Last chance" : `Round ${data.round?.number}`}</h1>
        <div className="text-right">
          <Label className="mb-1.5">Closes <When iso={data.round?.closesAt ?? null} style="time" /></Label>
          <Countdown closes={closes} skew={skew} serverNow={data.now} />
        </div>
      </div>
      <TimeBar closes={closes} skew={skew} serverNow={data.now} total={total} />

      <div className="mt-5 flex flex-wrap items-end gap-x-7 gap-y-4">
        <div>
          <Label>Max bid</Label>
          <div className="font-display mt-1 text-2xl leading-none">{money(me.maxBid)}</div>
        </div>
        <div>
          <Label>{bids.length === 1 ? "1 bid" : `${bids.length} bids`}</Label>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`font-display text-2xl leading-none ${over ? "text-amber-300" : ""}`}>{money(sum)}</span>
            {over && <span className="text-[10px] text-amber-300/70">over cap if all win</span>}
          </div>
        </div>
      </div>

      {/* who has bid this round: each GM's badge lights up once they have (never what or on whom) */}
      <Label className="mt-5">Bids in</Label>
      <div className="mt-2 flex items-center justify-between">
        {data.teams.map((t) => (
          <span key={t.id} title={t.name} className={`transition-[opacity,filter] duration-500 ${t.hasBid ? "" : "opacity-25 grayscale"}`}>
            <Gm team={t.look} size="sm" />
          </span>
        ))}
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.players.map((p, i) => (
          <DealtCard key={p.id} p={p} i={i} bid={myBids[p.id]} go={go} onOpen={onOpen} />
        ))}
      </div>
      {data.last && <Results past results={data.last} teams={data.teams} me={me} skew={skew} serverNow={data.now} canRenounce={false} onReplay={onReplay} />}
    </section>
  );
}

// The round's clock. With hours to go it's a plain "9:59:12"; in the last hour, big rolling minutes and seconds.
function Countdown({ closes, skew, serverNow }: { closes: number; skew: number; serverNow: number }) {
  const secs = useSecondsLeft(closes, skew, serverNow);
  if (secs >= 3600) return <div className="font-display text-4xl leading-[0.85] tabular-nums">{left(secs)}</div>;
  const mm = Math.floor(secs / 60), ss = secs % 60;
  return (
    <div className={`font-display flex justify-end text-6xl leading-[0.85] transition-colors duration-500 ${secs <= 10 ? "text-[var(--crimson)]" : ""}`}>
      {mm >= 10 && <Digit d={Math.floor(mm / 10)} />}
      <Digit d={mm % 10} />
      <span className="px-0.5 text-white/30">:</span>
      <Digit d={Math.floor(ss / 10)} />
      <Digit d={ss % 10} />
    </div>
  );
}

// Each second the bar slides (a transform, linear over that second) to where it will be when the next one ticks.
function TimeBar({ closes, skew, serverNow, total }: { closes: number; skew: number; serverNow: number; total: number }) {
  const secs = useSecondsLeft(closes, skew, serverNow);
  const to = Math.min(1, Math.max(0, (secs - 1) / total));
  return (
    <div className="mt-4 h-[2px] overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full origin-left [transition:transform_1s_linear,background-color_300ms_linear] ${secs <= 10 ? "bg-[var(--crimson)]" : "bg-white/80"}`}
        style={{ transform: `scaleX(${to})` }}
      />
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

// Mouse tilt only where there is a real mouse (not on phones, where it would just cost layers).
const FINE = "(hover: hover) and (pointer: fine)";
function subscribeFine(cb: () => void) {
  const m = window.matchMedia(FINE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
const useFinePointer = () => useSyncExternalStore(subscribeFine, () => window.matchMedia(FINE).matches, () => false);

type DealtProps = { p: CardPlayer; i: number; bid?: number; go: boolean; onOpen: (p: CardPlayer) => void };

// A card dealt face down that flips over (once `go`) and tilts under the mouse. Once it has flipped it is a plain
// card: no back face, no 3D. Polls bring fresh copies of the same players, so cards compare them by content.
const DealtCard = memo(
  function DealtCard({ p, i, bid, go, onOpen }: DealtProps) {
    const rx = useSpring(0, { stiffness: 220, damping: 18 });
    const ry = useSpring(0, { stiffness: 220, damping: 18 });
    const tilt = useFinePointer();
    // On a cold open the room's first page skips its entrance (and so do the cards in it): they're dealt face up.
    const dealt = useContext(PresenceContext)?.initial === false;
    const [flipped, setFlipped] = useState(dealt);
    // The wrappers stay put after the flip (just without their 3D), so the photo isn't loaded and drawn again.
    const card = (
      <motion.div
        className="relative"
        style={flipped ? undefined : { transformStyle: "preserve-3d" }}
        initial={flipped ? false : { rotateY: 180 }}
        animate={go ? { rotateY: 0 } : undefined}
        transition={{ delay: 0.25 + i * 0.08, duration: 0.8, ease }}
        onAnimationComplete={() => go && setFlipped(true)}
      >
        <div className={flipped ? undefined : "face"}>
          <PlayerCard p={p} bid={bid} />
        </div>
        {!flipped && (
          <div className="face absolute inset-0 [transform:rotateY(180deg)]">
            <CardBack />
          </div>
        )}
      </motion.div>
    );
    return (
      <motion.button
        type="button"
        onClick={() => onOpen(p)}
        className={`relative block w-full text-left ${flipped && !tilt ? "" : "[perspective:1000px]"}`}
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.05, duration: 0.5, ease }}
        whileTap={{ scale: 0.97 }}
        onPointerMove={
          tilt
            ? (e) => {
                if (e.pointerType !== "mouse") return;
                const r = e.currentTarget.getBoundingClientRect();
                ry.set(((e.clientX - r.left) / r.width - 0.5) * 12);
                rx.set(-((e.clientY - r.top) / r.height - 0.5) * 12);
              }
            : undefined
        }
        onPointerLeave={
          tilt
            ? () => {
                rx.set(0);
                ry.set(0);
              }
            : undefined
        }
      >
        {tilt ? <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: flipped ? undefined : "preserve-3d" }}>{card}</motion.div> : card}
      </motion.button>
    );
  },
  (a, b) =>
    a.i === b.i && a.bid === b.bid && a.go === b.go && a.onOpen === b.onOpen && (a.p === b.p || JSON.stringify(a.p) === JSON.stringify(b.p)),
);

function Locked() {
  // Stays fully dark a moment after the reveal arrives, so the show fades in over it rather than over the cards.
  return (
    <motion.div
      data-overlay
      className="fixed inset-0 z-50 grid touch-none place-items-center bg-black/85"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { delay: 0.6, duration: 0.35 } }}
    >
      <motion.div initial={{ scale: 1.3, opacity: 0, filter: "blur(10px)" }} animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.6, ease }} className="text-center">
        <div className="font-display text-7xl leading-none">Bids locked</div>
        <Kicker className="mt-3">The reveal is coming</Kicker>
      </motion.div>
    </motion.div>
  );
}

// ---------- the reveal ----------

// Whether I've watched a round's reveal show. Unknown (null) on the server: the show and the results both wait for the browser.
const seenSubs = new Set<() => void>();
const seenHere = new Set<string>(); // in case storage is off: at least don't replay it on this page
const seenKey = (round: string) => `bid-reveal-seen:${round}`;
function readSeen(round: string) {
  if (seenHere.has(round)) return true;
  try {
    return localStorage.getItem(seenKey(round)) === "1";
  } catch {
    return true;
  }
}
function markSeen(round: string) {
  seenHere.add(round);
  try {
    localStorage.setItem(seenKey(round), "1");
  } catch {
    // private mode: the show simply plays again next time
  }
  seenSubs.forEach((f) => f());
}
function subscribeSeen(cb: () => void) {
  seenSubs.add(cb);
  return () => {
    seenSubs.delete(cb);
  };
}
function useSeen(round: string | null) {
  return useSyncExternalStore(subscribeSeen, () => (round ? readSeen(round) : true), () => (round ? null : true));
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
  const btn = "h-10 rounded-full px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-40";
  return (
    <div className="glass fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-1 px-4 py-2.5">
        {data.phase === "contracts" && <button disabled={pending} onClick={act(() => A.lockContracts(true), "Lock everyone's contract lengths?")} className={`${btn} btn-primary`}>Lock contracts</button>}
        {data.phase === "done" && <button disabled={pending} onClick={act(() => A.lockContracts(false))} className={`${btn} text-white/70 hover:text-white`}>Unlock contracts</button>}
        {err && <p className="basis-full text-right text-xs text-[var(--bad)]">{err}</p>}
      </div>
    </div>
  );
}
