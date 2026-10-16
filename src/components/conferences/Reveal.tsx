"use client";
import { useEffect, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import { useScrollLock } from "@/components/ScrollLock";
import TeamAvatar from "@/components/TeamAvatar";
import { display } from "@/components/lottery/font";
import type { ConferenceReveal, RevealTeam } from "@/lib/conference-reveal";

const EASE = [0.22, 1, 0.36, 1] as const;
// When each part comes in, in seconds from the open: "Introducing", the word, Paris (its drawing, its name, its
// teams), London, the close button.
const T = { intro: 0.2, word: 0.55, paris: 1.6, london: 2.5, close: 5.2 };
const AFTER = { name: 1.0, teams: 1.3 }; // after a conference's drawing starts
const DRAW = 1.1; // one line of a drawing

// The conferences reveal, as a show over the league app, kept to the bare minimum: "Introducing" then CONFERENCES
// sliding up out of a mask, then Paris and London, each a line drawing that draws itself (the Eiffel Tower, a
// London bus), its name, and its four GMs rising in under it. Nothing else. Closing fades out, then leaves.
export default function Reveal({ data, onClose }: { data: ConferenceReveal; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  useScrollLock();

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && setClosing(true);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 250);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Introducing conferences"
        data-scrolls
        className={`${display.variable} fixed inset-0 z-[60] overflow-y-auto overflow-x-hidden overscroll-contain bg-[#07070b] text-white`}
        style={{ colorScheme: "dark" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.25 }}
      >
        <button
          onClick={() => setClosing(true)}
          aria-label="Close"
          className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur transition hover:bg-white/20"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 stroke-current" fill="none" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
        </button>

        <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))]">
          <h1 className="text-center">
            <motion.span
              initial={{ opacity: 0, letterSpacing: "0.6em" }}
              animate={{ opacity: 1, letterSpacing: "0.42em" }}
              transition={{ delay: T.intro, duration: 1.1, ease: EASE }}
              className="block text-[11px] font-semibold uppercase text-white/50"
            >
              Introducing
            </motion.span>
            <span className="mt-3 block overflow-hidden">
              <motion.span
                initial={{ y: "108%" }}
                animate={{ y: 0 }}
                transition={{ delay: T.word, duration: 1, ease: EASE }}
                className="font-display silver-text block text-[3.6rem] leading-[0.9] sm:text-8xl"
              >
                Conferences
              </motion.span>
            </span>
          </h1>

          <div className="mt-12 grid flex-1 grid-cols-1 gap-12 sm:mt-16 sm:grid-cols-2 sm:gap-6">
            <Side name={data.paris.name} teams={data.paris.teams} at={T.paris} tint="#e9c46a">
              <EiffelTower at={T.paris} />
            </Side>
            <Side name={data.london.name} teams={data.london.teams} at={T.london} tint="#ff5a6e">
              <Bus at={T.london} />
            </Side>
          </div>

          <motion.button
            type="button"
            onClick={() => setClosing(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: T.close, duration: 0.6 }}
            className="mx-auto mt-14 rounded-full px-6 py-2.5 text-sm font-semibold text-white/60 transition hover:text-white"
          >
            Close
          </motion.button>
        </div>
      </motion.div>
    </MotionConfig>
  );
}

// One conference: its drawing (passed in), a faint glow in its colour behind it, its name, its four GMs.
function Side({ name, teams, at, tint, children }: { name: string; teams: RevealTeam[]; at: number; tint: string; children: React.ReactNode }) {
  return (
    <section aria-label={name} className="relative flex flex-col items-center text-center">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-16 h-56 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${tint} 22%, transparent), transparent)` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: at + 0.6, duration: 1.6 }}
      />
      <div className="relative h-36 w-40 text-white/90">{children}</div>
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: at + AFTER.name, duration: 0.6, ease: EASE }}
        className="font-display relative mt-5 text-4xl leading-none tracking-[0.12em]"
      >
        {name}
      </motion.h2>
      <ul className="relative mt-5 grid w-full max-w-xs grid-cols-4 gap-2">
        {teams.map((t, i) => (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: at + AFTER.teams + i * 0.1, duration: 0.5, ease: EASE }}
            className="flex flex-col items-center gap-1.5"
          >
            <TeamAvatar team={t} />
            <span className="truncate text-xs text-white/60">{t.gm}</span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

// A line of a drawing that draws itself, from `at` plus its place in the order.
function Line({ d, at, i }: { d: string; at: number; i: number }) {
  return <motion.path d={d} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: at + i * 0.1, duration: DRAW, ease: "easeInOut" }} />;
}

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

// The Eiffel Tower, in a few lines: the two legs, the arch, three platforms, the lattice, the spire.
function EiffelTower({ at }: { at: number }) {
  const lines = [
    "M16 146 C 28 108 40 60 47 8", // left leg
    "M84 146 C 72 108 60 60 53 8", // right leg
    "M47 8 L50 2 L53 8", // the top
    "M30 146 C 36 124 42 108 50 102 C 58 108 64 124 70 146", // the arch
    "M24 94 H76", // first platform
    "M36 58 H64", // second
    "M44 22 H56", // third
    "M27 122 L73 108 M27 108 L73 122", // lattice, bottom
    "M32 84 L68 68 M32 68 L68 84", // lattice, middle
    "M6 146 H94", // the ground
  ];
  return (
    <svg viewBox="0 0 100 150" className="mx-auto h-full" {...STROKE} aria-hidden>
      {lines.map((d, i) => <Line key={d} d={d} at={at} i={i} />)}
    </svg>
  );
}

// A London bus, side on, in a few lines: the body, the two decks' windows, the door, the wheels.
function Bus({ at }: { at: number }) {
  const lines = [
    "M14 86 V26 Q14 12 28 12 H136 Q150 12 150 26 V86 Z", // the body
    "M14 48 H150", // between the decks
    "M24 20 h22 v18 h-22 z M54 20 h22 v18 h-22 z M84 20 h22 v18 h-22 z M114 20 h22 v18 h-22 z", // upper windows
    "M24 56 h12 v30 h-12 z", // the door
    "M46 56 h22 v16 h-22 z M78 56 h22 v16 h-22 z", // lower windows
    "M110 56 h30 v16 h-30 z", // the cab
    "M42 95 a9 9 0 1 0 0.01 0 M42 89 a3 3 0 1 0 0.01 0", // wheels
    "M122 95 a9 9 0 1 0 0.01 0 M122 89 a3 3 0 1 0 0.01 0",
  ];
  return (
    <svg viewBox="0 0 160 110" className="mx-auto h-full" {...STROKE} aria-hidden>
      {lines.map((d, i) => <Line key={d} d={d} at={at} i={i} />)}
    </svg>
  );
}
