"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useScrollLock } from "@/components/ScrollLock";
import TeamAvatar from "@/components/TeamAvatar";
import { display } from "@/components/lottery/font";
import type { ConferenceReveal, RevealTeam } from "@/lib/conference-reveal";
import type { Conference } from "@/lib/conferences";

const EASE = [0.22, 1, 0.36, 1] as const;
const SLAM = [0.16, 1, 0.3, 1] as const; // lands hard, then settles
// How long each story stays up before the next one; the last one stays until closed.
const HOLD = [5, 9.5, 14];
const TINT: Record<Conference, string> = { paris: "#e9c46a", london: "#ff5a6e" };
const PAPER: Record<Conference, string[]> = { paris: ["#e9c46a", "#fff3cc", "#ffffff", "#f4a261", "#ffd166"], london: ["#ff5a6e", "#ffd3d9", "#ffffff", "#ff93a4", "#ffffff"] };
const ICON: Record<Conference, string> = { paris: "/conferences/paris.png", london: "/conferences/london.png" };

// The conferences reveal, as three stories over the league app (bars on top; tap the right side to move on, the
// left to go back, or wait). 1: "Introducing", three dots for suspense, then CONFERENCES slams in with a flash.
// 2: "You have been placed in", the dots again, then the city's name slams in in its colour under a rain of
// confetti, the city's icon, and "with" the three GMs of the conference. 3: Paris left, London right, the teams
// under each, rows lined up. Closing fades out, then leaves.
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
            {story === 1 && <Placed data={data} />}
            {story === 2 && <Columns data={data} onClose={() => setClosing(true)} />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  );
}

// 1. "Introducing", the dots, then CONFERENCES.
function Intro() {
  const at = 2.5; // when the word lands
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
      <Flash at={at} />
      <Glow at={at} color="#ffffff" />
      <motion.span
        initial={{ opacity: 0, letterSpacing: "0.7em" }}
        animate={{ opacity: 1, letterSpacing: "0.42em" }}
        transition={{ delay: 0.2, duration: 1.2, ease: EASE }}
        className="relative block text-[11px] font-semibold uppercase text-white/55"
      >
        Introducing
      </motion.span>
      <Dots at={0.9} until={at} />
      <Stamp at={at} className="font-display relative block text-[3.9rem] leading-[0.9] sm:text-8xl">
        Conferences
      </Stamp>
    </div>
  );
}

// 2. "You have been placed in", the dots, the city, confetti, its icon, the three others.
function Placed({ data }: { data: ConferenceReveal }) {
  const mine = data.mine;
  const tint = TINT[mine];
  const at = 2.7; // when the city lands
  const others = data[mine].teams.filter((t) => t.id !== data.me).map((t) => t.gm);
  const list = others.length > 1 ? `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}` : others.join("");
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
      <Glow at={at} color={tint} />
      <Confetti colors={PAPER[mine]} from={at} />
      <Flash at={at} />
      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.8 }} className="relative text-sm text-white/55">
        You have been placed in
      </motion.span>
      <Dots at={1.1} until={at} />
      <Stamp at={at} className="font-display relative block px-3 text-[5.5rem] leading-[0.92] tracking-[0.04em] sm:text-9xl" style={{ color: tint }}>
        {data[mine].name}
      </Stamp>
      <motion.img
        src={ICON[mine]}
        alt=""
        draggable={false}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: at + 0.9, duration: 0.8, ease: EASE }}
        className="relative mt-5 h-36 w-36 sm:h-48 sm:w-48"
      />
      {!!others.length && (
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: at + 1.6, duration: 0.7, ease: EASE }} className="relative mt-5 text-base text-white/75">
          with <span className="font-semibold text-white">{list}</span>
        </motion.p>
      )}
    </div>
  );
}

// 3. Paris on the left, London on the right, the teams under each in rows of one height, so the columns line up.
function Columns({ data, onClose }: { data: ConferenceReveal; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col justify-center px-5 pb-8 pt-14">
      <div className="grid grid-cols-2 gap-5 sm:mx-auto sm:max-w-2xl sm:gap-12">
        <Column conference="paris" teams={data.paris.teams} name={data.paris.name} me={data.me} at={0.2} />
        <Column conference="london" teams={data.london.teams} name={data.london.name} me={data.me} at={0.4} />
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
      <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: at, duration: 0.6, ease: EASE }} className="font-display h-9 text-4xl leading-none tracking-[0.1em]" style={{ color: tint }}>
        {name}
      </motion.h2>
      <motion.div aria-hidden className="mt-3 h-px w-full origin-left" style={{ background: tint, opacity: 0.4 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: at + 0.2, duration: 0.8, ease: EASE }} />
      <ul className="mt-3">
        {teams.map((t, i) => (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: at + 0.5 + i * 0.12, duration: 0.5, ease: EASE }}
            className={`flex h-14 items-center gap-2.5 ${t.id === me ? "" : "opacity-70"}`}
          >
            <TeamAvatar team={t} size="sm" />
            <span className="min-w-0 leading-[1.15]">
              <span className="line-clamp-2 text-[12.5px] font-semibold">{t.name}</span>
              <span className="block text-[11px] text-white/45">{t.gm}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

// Big text landing: from twice its size and nothing, down onto the page.
function Stamp({ children, at, className, style }: { children: React.ReactNode; at: number; className: string; style?: React.CSSProperties }) {
  return (
    <motion.span initial={{ opacity: 0, scale: 2.2 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: at, duration: 0.65, ease: SLAM }} className={className} style={style}>
      {children}
    </motion.span>
  );
}

// A white flash over everything and a ring racing out from the middle: the moment something lands.
function Flash({ at }: { at: number }) {
  return (
    <>
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-white" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0] }} transition={{ delay: at, duration: 0.7, times: [0, 0.12, 1], ease: "easeOut" }} />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 0.6, 9], opacity: [0, 0.8, 0] }}
        transition={{ delay: at, duration: 1.2, times: [0, 0.05, 1], ease: "easeOut" }}
      />
    </>
  );
}

// A soft glow in a colour behind the middle of the screen, there from the moment something lands.
function Glow({ at, color }: { at: number; color: string }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${color} 26%, transparent), transparent)` }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: at, duration: 1.4, ease: EASE }}
    />
  );
}

// Three dots, one after the other, for suspense; they go when what they waited for arrives.
function Dots({ at, until }: { at: number; until: number }) {
  return (
    <span aria-hidden className="relative my-4 flex h-3 items-center gap-2.5">
      {[0, 1, 2].map((i) => {
        const from = at + i * 0.4, d = until - from;
        return (
          <motion.span
            key={i}
            className="block h-2 w-2 rounded-full bg-white/70"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1, 1, 0.6] }}
            transition={{ delay: from, duration: d, times: [0, 0.25 / d, 1 - 0.25 / d, 1], ease: "easeOut" }}
          />
        );
      })}
    </span>
  );
}

// Confetti on a canvas behind the second story: pieces of paper in the conference's colours rain from the top,
// tumbling and drifting, from the moment the city lands. Nothing with reduced motion on.
function Confetti({ colors, from }: { colors: string[]; from: number }) {
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
    type Piece = { x: number; y: number; vy: number; drift: number; phase: number; w: number; h: number; angle: number; spin: number; flip: number; flipSpeed: number; color: string };
    const pieces: Piece[] = [];
    const TOTAL = 240;
    let made = 0, raf = 0;
    const t0 = performance.now();
    const spawn = () => {
      pieces.push({
        x: Math.random() * canvas.width, y: -(10 + Math.random() * 80) * dpr, vy: (1.5 + Math.random() * 2) * dpr, drift: (Math.random() - 0.5) * 0.5 * dpr, phase: Math.random() * Math.PI * 2,
        w: (5 + Math.random() * 5) * dpr, h: (8 + Math.random() * 8) * dpr, angle: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.14, flip: Math.random() * Math.PI, flipSpeed: 0.07 + Math.random() * 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
      made++;
    };
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      if (t >= from && made < TOTAL) for (let i = 0; i < 5 && made < TOTAL; i++) spawn();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.y += p.vy;
        p.x += p.drift + Math.sin(t * 3 + p.phase) * 0.6 * dpr;
        p.angle += p.spin;
        p.flip += p.flipSpeed;
        if (p.y > canvas.height + 30 * dpr) {
          pieces.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(Math.cos(p.flip), 1); // a piece of paper turning over
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (made < TOTAL || pieces.length) raf = requestAnimationFrame(tick);
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
