"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useScrollLock } from "@/components/ScrollLock";
import TeamAvatar from "@/components/TeamAvatar";
import { display } from "@/components/lottery/font";
import type { ConferenceReveal, RevealTeam } from "@/lib/conference-reveal";
import type { Conference } from "@/lib/conferences";

const EASE = [0.22, 1, 0.36, 1] as const;
// How long each story stays up before the next one; the last one stays until closed.
const HOLD = [3.4, 7, 12];
const TINT: Record<Conference, string> = { paris: "#e9c46a", london: "#ff5a6e" };
const SPARKS: Record<Conference, string[]> = { paris: ["#e9c46a", "#fff3cc", "#ffffff", "#f4a261"], london: ["#ff5a6e", "#ffd3d9", "#ffffff", "#ff93a4"] };
const ICON: Record<Conference, string> = { paris: "/conferences/paris.png", london: "/conferences/london.png" };

// The conferences reveal, as three stories over the league app (bars on top, tap the right side to move on, the
// left to go back, or wait): "Introducing Conferences"; "You have been placed in" PARIS or LONDON with the city's
// icon and fireworks; then the two conferences side by side, Paris left, London right, their teams under them.
// Closing fades out, then leaves.
export default function Reveal({ data, onClose }: { data: ConferenceReveal; onClose: () => void }) {
  const [story, setStory] = useState(0);
  const [closing, setClosing] = useState(false);
  const last = HOLD.length - 1;
  useScrollLock();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
      if (e.key === "ArrowRight") setStory((s) => Math.min(s + 1, last));
      if (e.key === "ArrowLeft") setStory((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [last]);
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 250);
    return () => clearTimeout(t);
  }, [closing, onClose]);
  // the icon of my conference is fetched during the first story, so it's there when the second one wants it
  useEffect(() => {
    new Image().src = ICON[data.mine];
  }, [data.mine]);
  // each story moves on by itself
  useEffect(() => {
    if (story >= last) return;
    const t = setTimeout(() => setStory(story + 1), HOLD[story] * 1000);
    return () => clearTimeout(t);
  }, [story, last]);

  const tap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.clientX < window.innerWidth * 0.3) setStory((s) => Math.max(s - 1, 0));
    else setStory((s) => Math.min(s + 1, last));
  };

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Introducing conferences"
        onClick={tap}
        className={`${display.variable} fixed inset-0 z-[60] select-none overflow-hidden bg-[#07070b] text-white`}
        style={{ colorScheme: "dark" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.25 }}
      >
        {/* the bars, one a story, the current one filling; the close */}
        <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5">
            {HOLD.map((d, i) => (
              <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
                {i < story && <div className="h-full w-full bg-white" />}
                {i === story && <motion.div key={story} className="h-full bg-white" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: d, ease: "linear" }} />}
              </div>
            ))}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setClosing(true);
            }}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur transition hover:bg-white/20"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 stroke-current" fill="none" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={story} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            {story === 0 && <Intro />}
            {story === 1 && <Placed conference={data.mine} name={data[data.mine].name} />}
            {story === 2 && <Columns data={data} onClose={() => setClosing(true)} />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  );
}

// 1. "Introducing", then CONFERENCES sliding up out of a mask.
function Intro() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <motion.span
        initial={{ opacity: 0, letterSpacing: "0.6em" }}
        animate={{ opacity: 1, letterSpacing: "0.42em" }}
        transition={{ delay: 0.2, duration: 1.1, ease: EASE }}
        className="block text-[11px] font-semibold uppercase text-white/50"
      >
        Introducing
      </motion.span>
      <span className="mt-3 block overflow-hidden">
        <motion.span initial={{ y: "108%" }} animate={{ y: 0 }} transition={{ delay: 0.5, duration: 1, ease: EASE }} className="font-display silver-text block text-[3.6rem] leading-[0.9] sm:text-8xl">
          Conferences
        </motion.span>
      </span>
    </div>
  );
}

// 2. "You have been placed in", the conference's name in its colour, its icon; fireworks behind.
function Placed({ conference, name }: { conference: Conference; name: string }) {
  const tint = TINT[conference];
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
      <Fireworks colors={SPARKS[conference]} from={1.3} />
      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.8 }} className="relative text-sm text-white/55">
        You have been placed in
      </motion.span>
      <span className="relative mt-2 block overflow-hidden px-3">
        <motion.span
          initial={{ y: "108%" }}
          animate={{ y: 0 }}
          transition={{ delay: 1.0, duration: 0.9, ease: EASE }}
          className="font-display block text-[5.5rem] leading-[0.92] tracking-[0.04em] sm:text-9xl"
          style={{ color: tint }}
        >
          {name}
        </motion.span>
      </span>
      <motion.img
        src={ICON[conference]}
        alt=""
        draggable={false}
        initial={{ opacity: 0, scale: 0.85, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1.7, duration: 0.9, ease: EASE }}
        className="relative mt-6 h-48 w-48 sm:h-64 sm:w-64"
      />
    </div>
  );
}

// 3. Paris on the left, London on the right, the teams under each. Mine stands out.
function Columns({ data, onClose }: { data: ConferenceReveal; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col justify-center px-5 pb-8 pt-14">
      <div className="grid grid-cols-2 gap-5 sm:mx-auto sm:max-w-2xl sm:gap-12">
        <Column conference="paris" teams={data.paris.teams} name={data.paris.name} me={data.me} at={0.2} />
        <Column conference="london" teams={data.london.teams} name={data.london.name} me={data.me} at={0.5} />
      </div>
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.2, duration: 0.6 }}
        className="mx-auto mt-12 rounded-full px-6 py-2.5 text-sm font-semibold text-white/60 transition hover:text-white"
      >
        Close
      </motion.button>
    </div>
  );
}

function Column({ conference, name, teams, me, at }: { conference: Conference; name: string; teams: RevealTeam[]; me: string; at: number }) {
  const tint = TINT[conference];
  return (
    <section aria-label={name}>
      <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: at, duration: 0.6, ease: EASE }} className="font-display text-4xl leading-none tracking-[0.1em]" style={{ color: tint }}>
        {name}
      </motion.h2>
      <motion.div aria-hidden className="mt-3 h-px w-full origin-left" style={{ background: tint, opacity: 0.4 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: at + 0.2, duration: 0.8, ease: EASE }} />
      <ul className="mt-4 space-y-3.5">
        {teams.map((t, i) => (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: at + 0.5 + i * 0.12, duration: 0.5, ease: EASE }}
            className={`flex items-center gap-2.5 ${t.id === me ? "" : "opacity-70"}`}
          >
            <TeamAvatar team={t} size="sm" />
            <span className="min-w-0 leading-tight">
              <span className="block text-[13px] font-semibold">{t.name}</span>
              <span className="block text-[11px] text-white/45">{t.gm}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

// Fireworks on a canvas behind the second story: bursts of sparks in the conference's colours for a few seconds,
// each spark slowing, falling and fading, leaving a short trail. Nothing with reduced motion on.
function Fireworks({ colors, from }: { colors: string[]; from: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    size();
    type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; r: number };
    const sparks: Spark[] = [];
    const burst = () => {
      const x = canvas.width * (0.2 + Math.random() * 0.6), y = canvas.height * (0.12 + Math.random() * 0.4);
      const n = 70 + Math.floor(Math.random() * 40), speed = (2.4 + Math.random() * 1.8) * dpr;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.12, v = speed * (0.5 + Math.random() * 0.6);
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 55 + Math.random() * 45, color: colors[i % colors.length], r: (0.9 + Math.random() * 1.3) * dpr });
      }
    };
    let raf = 0, next = from * 1000;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = now - t0;
      if (t >= next && t < 6500) {
        burst();
        if (Math.random() < 0.4) burst();
        next = t + 500 + Math.random() * 500;
      }
      ctx.globalCompositeOperation = "destination-out"; // last frame fades a little: the trails
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life++;
        s.vx *= 0.985;
        s.vy = s.vy * 0.985 + 0.05 * dpr; // drag, then gravity
        s.x += s.vx;
        s.y += s.vy;
        const alpha = 1 - s.life / s.max;
        if (alpha <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (t < 12000 || sparks.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", size);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, [colors, from, reduced]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
