"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, MotionConfig, useIsPresent, useMotionValue, useTransform } from "motion/react";
import type { CardPlayer, Results, RoomTeam } from "@/lib/bidding";
import { BID_STEP, money, type RevealItem } from "@/lib/rules";
import PlayerCard, { CardBack, cardImages } from "./PlayerCard";
import { preload, ready } from "./preload";
import { BidStatus, ease, Gm, GOLD, reasonText, roundName } from "./ui";
import s from "./gold.module.css";

// Each player's moments, in ms from when his photo is ready: the card gathers light and trembles, turns over,
// the team he signs with spells itself out, the amount counts up and lands, then every other bid.
const AT = { tremble: 1200, flip: 2000, team: 3600, amount: 4400, landed: 6300, others: 7200 } as const;
const HOLD = 11500; // ms each player stays on screen

// Stages a player goes through (the AT moments in order).
const TREMBLE = 1, FLIPPED = 2, TEAM = 3, AMOUNT = 4, LANDED = 5, OTHERS = 6;

// Full screen and dark, one player at a time. Everyone watches every signing to the end; only the last chance
// round (dozens of leftovers) can be tapped through or skipped.
export default function RevealShow({ results, teams, meId, onDone }: { results: Results; teams: RoomTeam[]; meId: string; onDone: () => void }) {
  const { round, items, players } = results;
  const skippable = round.kind === "leftovers";
  const [i, setI] = useState(0);
  const [started, setStarted] = useState(-1); // the player whose clock is running (his photo is decoded)
  const next = () => (i + 1 < items.length ? setI(i + 1) : onDone());
  const item = items[i];
  const player = item && players.find((p) => p.id === item.playerId);
  // Start decoding every photo of the round now, so each player is ready by the time he's up.
  const photos = players.flatMap((p) => Object.values(cardImages(p, "large"))).join("\n");
  useEffect(() => preload(photos.split("\n")), [photos]);
  return (
    <motion.div
      data-overlay
      className="fixed inset-0 z-[60] touch-none overflow-hidden bg-[#050507] text-white"
      style={{ "--gold": GOLD } as React.CSSProperties}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.8 } }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(42rem 30rem at 50% 34%, rgba(233,196,106,0.07), transparent 70%)" }} />
      <Dust />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/55">{roundName(round)}</div>
        {/* Progress: done players are a plain full bar, only the current one fills (a transform, so it stays off the main thread).
            It's a timer the show depends on, so it still runs when the device asks for less motion. */}
        <MotionConfig reducedMotion="never">
          <div className="flex flex-1 gap-1">
            {items.map((it, k) => (
              <div key={it.playerId} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                {k < i && <div className="h-full bg-[var(--gold)]" />}
                {k === i && (
                  <motion.div
                    key={i}
                    className="h-full origin-left bg-[var(--gold)]"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: started === i ? 1 : 0 }}
                    transition={{ duration: HOLD / 1000, ease: "linear" }}
                  />
                )}
              </div>
            ))}
          </div>
        </MotionConfig>
        {skippable && <button onClick={onDone} className="shrink-0 text-xs font-semibold uppercase tracking-widest text-white/60 hover:text-white">Skip</button>}
      </div>
      <AnimatePresence>
        {item && player && (
          <Stage
            key={item.playerId}
            item={item}
            player={player}
            teams={teams}
            meId={meId}
            leftovers={skippable}
            onStart={() => setStarted(i)}
            onFinish={next}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Stage({ item, player, teams, meId, leftovers, onStart, onFinish }: {
  item: RevealItem; player: CardPlayer; teams: RoomTeam[]; meId: string; leftovers: boolean; onStart: () => void; onFinish: () => void;
}) {
  const [stage, setStage] = useState(0);
  const [jumped, setJumped] = useState(false); // tapped to the end: everything shows at once, no count up
  const finish = useRef(onFinish);
  const begin = useRef(onStart);
  const present = useIsPresent();
  const live = useRef(present);
  useEffect(() => {
    finish.current = onFinish;
    begin.current = onStart;
    live.current = present;
  });
  // The clock starts once his photo and logo are decoded (0.8 s at most), so the card never flips onto a blank face.
  const { face, logo } = cardImages(player, "large");
  useEffect(() => {
    let alive = true;
    let ts: ReturnType<typeof setTimeout>[] = [];
    ready([face, logo], 800).then(() => {
      if (!alive || !live.current) return; // already tapped past him
      begin.current();
      const at = (ms: number, st: number) => setTimeout(() => setStage((x) => Math.max(x, st)), ms);
      ts = [
        at(AT.tremble, TREMBLE), at(AT.flip, FLIPPED), at(AT.team, TEAM), at(AT.amount, AMOUNT), at(AT.landed, LANDED), at(AT.others, OTHERS),
        setTimeout(() => live.current && finish.current(), HOLD),
      ];
    });
    return () => {
      alive = false;
      ts.forEach(clearTimeout);
    };
  }, [face, logo]);
  // Only in the last chance round: tap to jump to the end of a player, tap again for the next.
  const tap = () => {
    if (!live.current || !leftovers) return;
    if (stage < OTHERS) {
      setJumped(true);
      setStage(OTHERS);
    } else finish.current();
  };

  const w = item.winner;
  const team = w ? teams.find((t) => t.id === w.teamId) : undefined;
  const mine = w?.teamId === meId;
  const others = item.bids.filter((b) => b.status !== "won");
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? "A team";
  const flipped = stage >= FLIPPED;
  const unsigned = stage >= TEAM && !w;
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-16 pt-20"
      onClick={tap}
      initial={{ opacity: 0, y: 70, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -60, scale: 0.9, filter: "blur(8px)", transition: { duration: 0.6, ease } }}
      transition={{ duration: 1, ease }}
    >
      {/* A flash of light as the card turns over. */}
      {flipped && !jumped && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(circle at 50% 38%, rgba(255,247,220,0.9), rgba(233,196,106,0.35) 30%, transparent 65%)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0] }}
          transition={{ duration: 1, times: [0, 0.3, 1], ease: "easeOut" }}
        />
      )}
      {/* Fireworks only when he's mine, the moment my name comes up. */}
      {stage >= TEAM && mine && <Confetti />}

      <motion.div
        className="relative w-[min(60vw,260px,34svh)] [perspective:1400px]"
        // a thud when "No bids" lands
        animate={unsigned && !jumped ? { x: [0, -9, 8, -5, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.45, delay: unsigned ? 0.25 : 0 }}
      >
        {/* Light behind the card: it gathers before the flip, then turns (gold for a signing, grey for nobody). */}
        <motion.div
          className={`pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[170vmin] w-[170vmin] -translate-x-1/2 -translate-y-1/2 ${s.rays}`}
          style={{ "--ray": w ? "rgb(233 196 106 / 0.17)" : "rgb(255 255 255 / 0.06)" } as React.CSSProperties}
          initial={{ opacity: 0 }}
          animate={{ opacity: flipped ? (unsigned ? 0.35 : 1) : 0 }}
          transition={{ duration: 1.6, ease }}
        />
        <motion.div
          className="pointer-events-none absolute -inset-20 -z-10 rounded-full"
          style={{ background: `radial-gradient(closest-side, ${w || !flipped ? "rgba(233,196,106,0.32)" : "rgba(255,255,255,0.08)"}, transparent)` }}
          initial={{ opacity: 0.15, scale: 0.6 }}
          animate={
            stage >= LANDED && w ? { opacity: [0.8, 1, 0.8], scale: [1.05, 1.15, 1.05] }
            : { opacity: flipped ? (w ? 0.75 : 0.4) : stage >= TREMBLE ? 0.65 : 0.35, scale: flipped ? 1 : stage >= TREMBLE ? 0.9 : 0.75 }
          }
          transition={stage >= LANDED && w ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : { duration: flipped ? 0.8 : 1.5, ease }}
        />
        {!flipped && <Gather />}
        {flipped && !jumped && <Shockwave />}
        {stage >= TEAM && mine && !jumped && <Burst />}

        {/* The card: breathes in, trembles, then lifts and turns over on a spring (smooth, a touch of overshoot). */}
        <motion.div
          initial={{ scale: 0.88, y: 10 }}
          animate={flipped ? { scale: 1, y: [0, -18, 0] } : { scale: 0.96, y: 0 }}
          transition={flipped ? { scale: { duration: 1.2, ease }, y: { duration: 1.4, times: [0, 0.4, 1], ease: "easeInOut" } } : { duration: AT.flip / 1000, ease: "easeIn" }}
        >
          <div className={stage === TREMBLE ? s.tremble : undefined}>
            <motion.div
              className="relative"
              style={{ transformStyle: "preserve-3d" }}
              initial={{ rotateY: 180 }}
              animate={{ rotateY: flipped ? 0 : 180 }}
              transition={jumped ? { duration: 0.5, ease } : { type: "spring", stiffness: 58, damping: 13, mass: 1.1 }}
            >
              <div className="face @container relative">
                <PlayerCard p={player} className={`transition-[filter] duration-[1400ms] ${unsigned ? "grayscale brightness-75" : ""}`} />
                {/* one sweep of light over the foil as it lands face up */}
                {flipped && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[7%/5%]">
                    <motion.div
                      className="absolute inset-y-0 w-[60%]"
                      style={{ background: "linear-gradient(105deg, transparent, rgba(255,244,200,0.55), transparent)" }}
                      initial={{ x: "-120%" }}
                      animate={{ x: "220%" }}
                      transition={{ delay: 0.7, duration: 1.2, ease: "easeInOut" }}
                    />
                  </div>
                )}
                {unsigned && (
                  <div className="absolute inset-0 grid place-items-center">
                    <motion.div
                      initial={{ scale: 2.6, opacity: 0, rotate: -26 }}
                      animate={{ scale: 1, opacity: 1, rotate: -14 }}
                      transition={{ delay: jumped ? 0 : 0.25, type: "spring", stiffness: 320, damping: 16 }}
                      className="font-display rounded-[3cqw] border-[1cqw] border-white/70 bg-black/50 px-[5cqw] py-[1cqw] text-[17cqw] leading-none text-white/85"
                    >
                      No bids
                    </motion.div>
                  </div>
                )}
              </div>
              <div className="face absolute inset-0 [transform:rotateY(180deg)]">
                <CardBack />
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      <div className="mt-8 min-h-44 w-full max-w-sm text-center">
        {stage >= TEAM && w && (
          <>
            <div className="flex items-center justify-center gap-3">
              <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: jumped ? 0 : 0.2, duration: 0.6, ease }}>
                <Gm team={team?.look} />
              </motion.span>
              <span className="font-display text-balance text-left text-[clamp(2rem,9vw,2.75rem)] leading-[0.9]">
                <Letters text={team?.name ?? "A team"} delay={jumped ? 0 : 0.3} fast={jumped} />
              </span>
            </div>
            {stage >= AMOUNT && (
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={stage >= LANDED ? { opacity: 1, scale: jumped ? 1 : [1, 1.14, 1] } : { opacity: 1, scale: 1 }}
                transition={stage >= LANDED ? { duration: 0.5, ease } : { type: "spring", stiffness: 200, damping: 16 }}
                className={`font-display ${s.goldText} mt-2 text-7xl leading-none`}
                style={stage >= LANDED ? { filter: "drop-shadow(0 0 18px rgba(233,196,106,0.45))" } : undefined}
              >
                <CountUp to={w.amount} instant={jumped} />
              </motion.div>
            )}
            {stage >= LANDED && w.tie && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: jumped ? 0 : 0.4 }} className="mt-1 text-xs text-white/55">
                {w.tie === "cap" ? "Tie · more cap space" : "Tie · computer pick"}
              </motion.div>
            )}
          </>
        )}
        {stage >= OTHERS && others.length > 0 && (
          <ul className="mt-5 space-y-2">
            {others.map((b, k) => (
              <motion.li
                key={b.bidId}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: jumped ? k * 0.06 : k * 0.3, duration: 0.5, ease }}
                className="flex items-center justify-center gap-2 text-sm text-white/60"
              >
                <BidStatus status={b.status as "lost" | "voided" | "renounced"} dark />
                <span className="truncate text-white/80">{name(b.teamId)}</span>
                <span className="font-display text-lg leading-none text-white/80">{money(b.amount)}</span>
                {b.status === "voided" && <span className="text-xs text-white/40">{reasonText(b.reason)}</span>}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

// A team name spelling itself out, letter by letter out of a blur. Words never break across lines.
function Letters({ text, delay, fast }: { text: string; delay: number; fast: boolean }) {
  const words = text.split(" ");
  const starts = words.map((_, wi) => words.slice(0, wi).join("").length); // letters before each word
  return (
    <span aria-label={text}>
      {words.map((word, wi) => (
        <Fragment key={wi}>
        {wi > 0 && " "}
        <span aria-hidden className="inline-block whitespace-nowrap">
          {[...word].map((ch, k) => (
            <motion.span
              key={k}
              className="inline-block"
              initial={{ opacity: 0, y: "0.3em", filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: delay + (starts[wi] + k) * (fast ? 0.01 : 0.045), duration: fast ? 0.25 : 0.55, ease }}
            >
              {ch}
            </motion.span>
          ))}
        </span>
        </Fragment>
      ))}
    </span>
  );
}

function CountUp({ to, instant }: { to: number; instant: boolean }) {
  const v = useMotionValue(instant ? to : 0);
  const text = useTransform(v, (x) => money(Math.round(x / BID_STEP) * BID_STEP));
  useEffect(() => {
    if (instant) {
      v.set(to);
      return;
    }
    const c = animate(v, to, { duration: (AT.landed - AT.amount) / 1000, ease: [0.12, 0.8, 0.25, 1] });
    return () => c.stop();
  }, [v, to, instant]);
  return <motion.span>{text}</motion.span>;
}

// A stable "random" number in [0, 1) for the k-th piece of something, so every screen draws the same.
const rand = (k: number, salt: number) => {
  const x = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Rings of light closing in on the card while it gathers itself.
function Gather() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10">
      {[0, 1, 2].map((k) => (
        <motion.span
          key={k}
          className="absolute -left-[45vmin] -top-[45vmin] block h-[90vmin] w-[90vmin] rounded-full border border-[#f3d27c]/60"
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 0.35, opacity: [0, 0.7, 0] }}
          transition={{ duration: 1.3, delay: k * 0.43, repeat: Infinity, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}

// The ring of light thrown out as the card flips.
function Shockwave() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10">
      {[0, 1].map((k) => (
        <motion.span
          key={k}
          className="absolute -left-[30vmin] -top-[30vmin] block h-[60vmin] w-[60vmin] rounded-full border-2 border-[#fff1c4]/80"
          initial={{ scale: 0.4, opacity: 0.9 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 1.1, delay: k * 0.14, ease: [0.1, 0.7, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

// Gold sparks flying out from behind the card when my amount lands.
function Burst() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10">
      {Array.from({ length: 24 }, (_, k) => {
        const a = (k / 24) * Math.PI * 2 + rand(k, 1) * 0.3;
        const d = 140 + rand(k, 2) * 110;
        const size = 3 + Math.round(rand(k, 3) * 3);
        return (
          <motion.span
            key={k}
            className="absolute block rounded-full bg-[#f6dc8a] shadow-[0_0_8px_rgba(246,220,138,0.9)]"
            style={{ width: size, height: size }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, opacity: 0, scale: 0.3 }}
            transition={{ duration: 1.2 + rand(k, 4) * 0.6, ease: [0.1, 0.8, 0.3, 1] }}
          />
        );
      })}
    </div>
  );
}

// Gold flakes falling over the screen: my signing.
function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 44 }, (_, k) => {
        const left = rand(k, 5) * 100;
        const drift = (rand(k, 6) - 0.5) * 120;
        const w = 4 + rand(k, 7) * 5;
        return (
          <motion.span
            key={k}
            className="absolute top-[-4%] block rounded-[1px]"
            style={{ left: `${left}%`, width: w, height: w * 1.8, background: k % 3 ? "#e9c46a" : "#fff1c4" }}
            initial={{ y: 0, x: 0, rotate: rand(k, 8) * 180, opacity: 0 }}
            animate={{ y: "110vh", x: drift, rotate: rand(k, 8) * 180 + 540, opacity: [0, 1, 1, 0.6] }}
            transition={{ duration: 2.8 + rand(k, 9) * 1.8, delay: rand(k, 10) * 0.6, ease: "easeIn" }}
          />
        );
      })}
    </div>
  );
}

// Gold dust drifting up behind everything, all show long (CSS: it keeps going while React is busy).
function Dust() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 22 }, (_, k) => {
        const size = 1.5 + rand(k, 11) * 2.5;
        return (
          <span
            key={k}
            className={s.mote}
            style={{
              left: `${rand(k, 12) * 100}%`, width: size, height: size,
              "--d": `${9 + rand(k, 13) * 9}s`, "--delay": `${-rand(k, 14) * 18}s`, "--x": `${(rand(k, 15) - 0.5) * 80}px`, "--o": 0.25 + rand(k, 16) * 0.5,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
