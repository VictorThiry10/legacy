"use client";
import { useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useIsPresent, useMotionValue, useTransform } from "motion/react";
import type { CardPlayer, Room, RoomTeam } from "@/lib/bidding";
import { BID_STEP, money, type RevealItem } from "@/lib/rules";
import PlayerCard, { CardBack } from "./PlayerCard";
import { ease, Gm, reasonText, roundName } from "./ui";

const HOLD = 6500; // ms each player stays on screen unless tapped on

// Full screen, one player at a time: the card flips, "signs with" the winner, the amount counts up,
// then every rejected bid. Tap to speed up, Skip to jump to the results.
export default function RevealShow({ data, onDone }: { data: Room; onDone: () => void }) {
  const items = data.reveal ?? [];
  const [i, setI] = useState(0);
  const next = () => (i + 1 < items.length ? setI(i + 1) : onDone());
  const item = items[i];
  const player = item && data.players.find((p) => p.id === item.playerId);
  return (
    <motion.div
      className="fixed inset-0 z-[60] touch-none overflow-hidden bg-[#050507] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(40rem 28rem at 50% 32%, rgba(255,255,255,0.06), transparent 70%)" }} />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/55">{roundName(data.round)}</div>
        <div className="flex flex-1 gap-1">
          {items.map((it, k) => (
            <div key={it.playerId} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <motion.div
                className="h-full bg-white"
                initial={{ width: "0%" }}
                animate={{ width: k <= i ? "100%" : "0%" }}
                transition={{ duration: k === i ? HOLD / 1000 : 0.25, ease: "linear" }}
              />
            </div>
          ))}
        </div>
        <button onClick={onDone} className="shrink-0 text-xs font-semibold uppercase tracking-widest text-white/60 hover:text-white">Skip</button>
      </div>
      <AnimatePresence>
        {item && player && (
          <Stage key={item.playerId} item={item} player={player} teams={data.teams} meId={data.meId} leftovers={data.round?.kind === "leftovers"} onFinish={next} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Stage({ item, player, teams, meId, leftovers, onFinish }: {
  item: RevealItem; player: CardPlayer; teams: RoomTeam[]; meId: string; leftovers: boolean; onFinish: () => void;
}) {
  // 0 face down, 1 flipped, 2 winner, 3 rejected bids
  const [stage, setStage] = useState(0);
  const finish = useRef(onFinish);
  const present = useIsPresent();
  const live = useRef(present);
  useEffect(() => {
    finish.current = onFinish;
    live.current = present;
  });
  useEffect(() => {
    const at = (ms: number, s: number) => setTimeout(() => setStage((x) => Math.max(x, s)), ms);
    const ts = [at(650, 1), at(1500, 2), at(2500, 3), setTimeout(() => live.current && finish.current(), HOLD)];
    return () => ts.forEach(clearTimeout);
  }, []);
  const tap = () => {
    if (!live.current) return;
    if (stage < 3) setStage(3);
    else finish.current();
  };

  const w = item.winner;
  const team = w ? teams.find((t) => t.id === w.teamId) : undefined;
  const others = item.bids.filter((b) => b.status !== "won");
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? "A team";
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-16 pt-20"
      onClick={tap}
      initial={{ x: "75vw", rotate: 6, opacity: 0 }}
      animate={{ x: 0, rotate: 0, opacity: 1 }}
      exit={{ x: "-75vw", rotate: -6, opacity: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 20 }}
    >
      <div className="relative w-[min(60vw,260px,38vh)] [perspective:1400px]">
        {stage >= 2 && w && (
          <>
            <motion.div
              className="absolute -inset-16 -z-10 rounded-full"
              style={{ background: "radial-gradient(closest-side, rgba(233,196,106,0.22), transparent)" }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, ease }}
            />
            <Burst />
          </>
        )}
        <motion.div
          className="relative"
          style={{ transformStyle: "preserve-3d" }}
          initial={{ rotateY: 180, scale: 0.92 }}
          animate={{ rotateY: stage >= 1 ? 0 : 180, scale: stage >= 2 ? 1 : 0.92 }}
          transition={{ rotateY: { duration: 0.95, ease: [0.3, 0.9, 0.2, 1] }, scale: { duration: 0.6, ease } }}
        >
          <div className="face @container relative">
            <PlayerCard p={player} className={`transition-[filter] duration-700 ${stage >= 2 && !w ? "grayscale brightness-75" : ""}`} />
            {stage >= 2 && !w && (
              <div className="absolute inset-0 grid place-items-center">
                <motion.div
                  initial={{ scale: 2.4, opacity: 0, rotate: -24 }}
                  animate={{ scale: 1, opacity: 1, rotate: -14 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
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

      <div className="mt-7 min-h-44 w-full max-w-sm text-center">
        {stage >= 2 &&
          (w ? (
            <>
              <motion.div
                initial={{ opacity: 0, letterSpacing: "0.9em" }}
                animate={{ opacity: 1, letterSpacing: "0.4em" }}
                transition={{ duration: 0.9, ease }}
                className="text-[11px] font-semibold uppercase text-white/60"
              >
                {player.name.split(" ").slice(-1)[0]} signs with
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 18, filter: "blur(12px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ delay: 0.15, duration: 0.7, ease }}
                className="mt-3 flex items-center justify-center gap-3"
              >
                <Gm name={team?.name} />
                <span className="font-display text-balance text-left text-[clamp(2rem,9vw,2.75rem)] leading-[0.9]">{team?.name}</span>
                {w.teamId === meId && <span className="text-[10px] font-semibold tracking-[0.25em] text-[var(--gold)]">YOU</span>}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, type: "spring", stiffness: 220, damping: 14 }}
                className="font-display mt-2 text-7xl leading-none text-[var(--gold)]"
              >
                <CountUp to={w.amount} />
              </motion.div>
              {w.tie && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-1 text-xs text-white/55">
                  {w.tie === "cap" ? "Tied bid · more cap space wins" : "Tied bid and cap space · the computer picked"}
                </motion.div>
              )}
            </>
          ) : (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
              <div className="font-display text-5xl leading-none text-white/80">Unsigned</div>
              <div className="mt-2 text-xs uppercase tracking-[0.3em] text-white/45">{leftovers ? "Stays a free agent" : "Goes to the last chance round"}</div>
            </motion.div>
          ))}
        {stage >= 3 && others.length > 0 && (
          <ul className="mt-5 space-y-1.5">
            {others.map((b, k) => (
              <motion.li
                key={b.bidId}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: k * 0.18, duration: 0.45, ease }}
                className="flex items-center justify-center gap-2 text-sm text-white/50"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">{b.status === "lost" ? "Rejected" : b.status === "voided" ? "Voided" : "Renounced"}</span>
                <span className="truncate text-white/70">{name(b.teamId)}</span>
                <span className="font-display text-lg leading-none text-white/70">{money(b.amount)}</span>
                {b.status === "voided" && <span className="text-xs text-white/35">{reasonText(b.reason)}</span>}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
      {stage >= 3 && (
        <motion.div
          className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] text-[10px] uppercase tracking-[0.35em] text-white/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          Tap to continue
        </motion.div>
      )}
    </motion.div>
  );
}

function CountUp({ to }: { to: number }) {
  const v = useMotionValue(0);
  const text = useTransform(v, (x) => money(Math.round(x / BID_STEP) * BID_STEP));
  useEffect(() => {
    const c = animate(v, to, { duration: 1.2, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [v, to]);
  return <motion.span>{text}</motion.span>;
}

// Gold sparks flying out from behind the card.
function Burst() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10">
      {Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2;
        const d = 150 + (k % 4) * 30;
        return (
          <motion.span
            key={k}
            className="absolute block rounded-full bg-white/80"
            style={{ width: 3 + (k % 3), height: 3 + (k % 3) }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, opacity: 0, scale: 0.3 }}
            transition={{ duration: 1.1 + (k % 5) * 0.12, ease: [0.1, 0.8, 0.3, 1] }}
          />
        );
      })}
    </div>
  );
}
