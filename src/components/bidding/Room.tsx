"use client";
import { memo, useCallback, useContext, useEffect, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, MotionConfig, PresenceContext, useSpring } from "motion/react";
import type { CardPlayer, Results as RoundResults, Room as Data, RoomTeam } from "@/lib/bidding";
import { money } from "@/lib/rules";
import * as A from "@/app/(league)/bidding/actions";
import PlayerCard, { CardBack, cardImages } from "./PlayerCard";
import BidSheet from "./BidSheet";
import RevealShow from "./RevealShow";
import Results from "./Results";
import Contracts from "./Contracts";
import Portal from "./Portal";
import { useClock } from "./clock";
import { left, useSecondsLeft, When } from "./time";
import { ready } from "./preload";
import { ease, Gm, roundName } from "./ui";
import { FORWARD } from "../Slide";

// The auction room, under the page's back bar. One page that changes with the round: waiting (the rounds to come),
// bidding (the cards, open all day), the results (renounce for an hour), then contract lengths. Polls a tiny
// fingerprint and refreshes when anything moves. `app`: signed in to the league app (no sign out of its own).
export default function Room({ data, me: who, app }: { data: Data; me: { id: string; name: string }; app: boolean }) {
  const router = useRouter();
  const skew = usePulse(data.v, nextMoment(data));
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

  // Bidding over: refresh until the server agrees and sends the results.
  const closes = data.phase === "bidding" ? Date.parse(data.round?.closesAt ?? "") : NaN;
  const ended = useClock((now) => now + skew >= closes, data.now);
  const over = data.phase === "bidding" && ended;
  useEffect(() => {
    if (!over) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [over, router]);

  // The results there are to watch: the live round's during its renounce window, else the round that just finished.
  // The show lives here, outside the page that changes with the phase, so moving on fades it out instead of
  // cutting it. It plays by itself the first time, except over a round that's open for bids (there it's a tap away).
  const results: RoundResults | null = data.phase === "reveal" && data.round && data.reveal ? { round: data.round, items: data.reveal, players: data.players } : data.last;
  const revealRound = results?.round.id ?? null;
  const seen = useSeen(revealRound);
  const [replay, setReplay] = useState<string | null>(null); // the round being replayed
  const replaying = revealRound !== null && replay === revealRound;
  const showing = revealRound !== null && ((seen === false && data.phase !== "bidding") || replaying);
  const showDone = () => {
    if (revealRound) markSeen(revealRound);
    setReplay(null);
  };
  const onReplay = () => setReplay(revealRound);
  const next = data.upcoming[0]?.round ?? null;

  return (
    // The cards and the reveal always animate (a phone's "reduce motion" setting was turning them off).
    <MotionConfig reducedMotion="never">
      <AnimatePresence mode="wait" initial={false} onExitComplete={() => window.scrollTo({ top: 0, behavior: "instant" })}>
        <motion.div
          key={`${data.phase}:${data.round?.id ?? ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          {data.phase === "waiting" && <Waiting data={data} me={me} skew={skew} onReplay={onReplay} />}
          {data.phase === "bidding" && <Bidding data={data} me={me} myBids={myBids} skew={skew} onOpen={onOpen} onReplay={onReplay} />}
          {data.phase === "reveal" && results && (seen || replaying) && (
            <Results results={results} teams={data.teams} me={me} skew={skew} serverNow={data.now} canRenounce={data.canRenounce} next={next} onReplay={onReplay} />
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
            className="fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[45] mx-auto w-fit max-w-[calc(100%-2rem)] rounded-full bg-fg px-4 py-2 text-center text-sm text-bg shadow-lg"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <Portal>
        <AnimatePresence>{showing && results && <RevealShow key="show" results={results} teams={data.teams} meId={data.meId} onDone={showDone} />}</AnimatePresence>
      </Portal>
      {/* sign out only for the email sign in (the app has its own) */}
      {!app && (
        <form action={A.signOut} className="pt-6 text-center text-xs text-muted">
          <button className="hover:text-fg">Sign out</button>
        </form>
      )}
    </MotionConfig>
  );
}

// The next moment the room changes by the clock (bidding closes, the renounce window ends, the next round opens).
function nextMoment(d: Data): number {
  const r = d.round;
  const t = d.phase === "bidding" ? r?.closesAt : d.phase === "reveal" ? r?.settlesAt : d.phase === "waiting" ? r?.opensAt : null;
  return t ? Date.parse(t) : NaN;
}

// Polls the room's fingerprint and refreshes the page when it differs from the one on screen (and that refresh
// wasn't already asked for), so nothing is missed between the page loading and the first poll, and my own
// moves (which refresh the page themselves) don't refresh it twice. Every 10 s, and every 2 s in the last minute
// before something is due. Also learns how far this clock is from the server's.
function usePulse(v: string, due: number) {
  const router = useRouter();
  const [skew, setSkew] = useState(0);
  const shown = useRef(v);
  const at = useRef(due);
  useEffect(() => {
    shown.current = v;
    at.current = due;
  }, [v, due]);
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
      const soon = Number.isFinite(at.current) && Math.abs(at.current - Date.now()) < 60_000;
      if (alive) t = setTimeout(tick, soon ? 2000 : 10_000);
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

// A section heading in the app's style: the title, something on the right.
function Heading({ title, right }: { title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {right && <div className="text-sm text-muted">{right}</div>}
    </div>
  );
}

// Between rounds: when the next one opens, the rounds to come with their players, and the round that just finished.
function Waiting({ data, me, skew, onReplay }: { data: Data; me: RoomTeam; skew: number; onReplay: () => void }) {
  return (
    <>
      {data.upcoming.map(({ round, players }, i) => (
        <section key={round.id} className="space-y-3">
          <Heading
            title={i === 0 ? <>{roundName(round)}</> : roundName(round)}
            right={round.opensAt ? <>Opens <When iso={round.opensAt} />{i === 0 && <> · <TimeLeft iso={round.opensAt} skew={skew} serverNow={data.now} /></>}</> : "Not scheduled yet"}
          />
          {/* full cards, with the numbers: the rounds are what GMs study all week */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {players.map((p, k) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(k, 8) * 0.03, duration: 0.3, ease }}>
                <Link href={`/players/${p.id}`} transitionTypes={FORWARD} className="block active:opacity-80">
                  <PlayerCard p={p} lazy={i > 0} />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      ))}
      {!data.upcoming.length && !data.last && <p className="text-sm text-muted">Nothing is scheduled yet.</p>}
      {data.last && <Results past results={data.last} teams={data.teams} me={me} skew={skew} serverNow={data.now} canRenounce={false} next={null} onReplay={onReplay} />}
    </>
  );
}

function Bidding({ data, me, myBids, skew, onOpen, onReplay }: {
  data: Data; me: RoomTeam; myBids: Record<string, number>; skew: number; onOpen: (p: CardPlayer) => void; onReplay: () => void;
}) {
  const closes = Date.parse(data.round?.closesAt ?? "");
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
  const overCap = sum > me.capSpace;
  return (
    <>
      <section className="space-y-3">
        <Heading title={roundName(data.round)} right={<Closes closes={closes} skew={skew} serverNow={data.now} />} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span><span className="text-muted">Max bid</span> <b className="tabular-nums">{money(me.maxBid)}</b></span>
          <span>
            <span className="text-muted">{bids.length === 1 ? "1 bid" : `${bids.length} bids`}</span> <b className={`tabular-nums ${overCap ? "text-orange" : ""}`}>{money(sum)}</b>
            {overCap && <span className="ml-1.5 text-xs text-orange">over the cap if all win</span>}
          </span>
        </div>
        {/* who has bid this round: each GM's badge lights up once they have (never what or on whom) */}
        <div className="flex items-center justify-between">
          {data.teams.map((t) => (
            <span key={t.id} title={t.name} className={`transition-[opacity,filter] duration-500 ${t.hasBid ? "" : "opacity-25 grayscale"}`}>
              <Gm team={t.look} size="sm" />
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.players.map((p, i) => (
            <DealtCard key={p.id} p={p} i={i} bid={myBids[p.id]} go={go} onOpen={onOpen} />
          ))}
        </div>
      </section>
      {data.last && <Results past results={data.last} teams={data.teams} me={me} skew={skew} serverNow={data.now} canRenounce={false} next={null} onReplay={onReplay} />}
    </>
  );
}

// When bidding closes, with how long is left: in hours and minutes all day, a live countdown in the last 5 minutes.
function Closes({ closes, skew, serverNow }: { closes: number; skew: number; serverNow: number }) {
  const secs = useSecondsLeft(closes, skew, serverNow);
  const urgent = secs < 300;
  return (
    <span className={urgent ? "font-semibold tabular-nums text-crimson" : ""}>
      {urgent ? left(secs) : <>Closes <When iso={new Date(closes).toISOString()} style="time" /> · {short(secs)}</>}
    </span>
  );
}
// "4h 12m", "38 min"
const short = (secs: number) => (secs >= 3600 ? `${Math.floor(secs / 3600)}h ${String(Math.floor((secs % 3600) / 60)).padStart(2, "0")}m` : `${Math.ceil(secs / 60)} min`);

function TimeLeft({ iso, skew, serverNow }: { iso: string; skew: number; serverNow: number }) {
  const secs = useSecondsLeft(Date.parse(iso), skew, serverNow);
  return <span className="tabular-nums">{secs >= 86400 ? left(secs) : short(secs)}</span>;
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
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.05, duration: 0.4, ease }}
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
