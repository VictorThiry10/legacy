"use client";
import { useEffect, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import { useScrollLock } from "@/components/ScrollLock";
import TeamAvatar from "@/components/TeamAvatar";
import { display } from "@/components/lottery/font";
import type { Release } from "@/lib/schedule-release";
import { teamColor, type Look } from "@/lib/team-look";

const EASE = [0.22, 1, 0.36, 1] as const;
// When each part comes in, in seconds from the open: the title, its words, the line under it, the opening
// matchup, the first row of the season, the playoffs, the button.
const T = { kicker: 0.15, word: 0.3, sub: 1.05, hero: 1.6, list: 3.4, playoffs: 4.8, button: 5.4 };
const ROW = 0.075; // between one row of the season and the next

// The schedule release, as a show over the league app: the title slides up out of a mask, the GM's opening
// matchup flies in from both sides and meets at a VS (a glow in each team's colour behind), then every week of
// his season cascades in, then the playoffs, then Let's go. The page scrolls, so nothing has to leave to make
// room. Closing fades out, then leaves.
export default function ScheduleRelease({ data, onClose }: { data: Release; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  useScrollLock(); // the app behind stays still; the show itself scrolls (data-scrolls)

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && setClosing(true);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // On a timer, so it doesn't hang on an animation the browser has paused.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 250);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  const opener = data.games[0];
  const mine = teamColor(data.me);
  const theirs = teamColor(opener.opponent);
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Schedule release"
        data-scrolls
        className={`${display.variable} bid-bg fixed inset-0 z-[60] overflow-y-auto overflow-x-hidden overscroll-contain text-white`}
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

        <div className="mx-auto max-w-lg px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))]">
          <header>
            <Kicker delay={T.kicker}>Legacy League · {data.season} season</Kicker>
            <h1 className="font-display mt-3 text-[4.6rem] leading-[0.86] sm:text-8xl">
              <Word delay={T.word}>Schedule</Word>
              <Word delay={T.word + 0.14}>Release</Word>
            </h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: T.sub, duration: 0.6 }} className="mt-4 text-sm text-white/55">
              {data.weeks} weeks, every team twice. The top 4 go to the playoffs.
            </motion.p>
          </header>

          {/* the opening matchup */}
          <motion.section
            aria-label="Opening week"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: T.hero - 0.25, duration: 0.5, ease: EASE }}
            className="relative mt-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.03] px-4 pb-6 pt-5"
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: T.hero + 0.45, duration: 1.4 }}
              style={{
                background: `radial-gradient(55% 90% at 18% 55%, color-mix(in srgb, ${theirs} 30%, transparent), transparent 72%), radial-gradient(55% 90% at 82% 55%, color-mix(in srgb, ${mine} 30%, transparent), transparent 72%)`,
              }}
            />
            <div className="relative">
              <Kicker delay={T.hero - 0.1} center>Opening week</Kicker>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: T.hero, duration: 0.5 }} className="num mt-1 text-center text-xs text-white/45">
                {opener.dates}
              </motion.div>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <Side look={opener.opponent} tag={opener.home ? "Away" : "Home"} from={-1} />
                <motion.div
                  initial={{ scale: 0.3, opacity: 0, filter: "blur(12px)" }}
                  animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                  transition={{ delay: T.hero + 0.5, duration: 0.5, ease: EASE }}
                  className="font-display pb-9 text-4xl text-white/45"
                >
                  VS
                </motion.div>
                <Side look={data.me} tag={opener.home ? "Home" : "Away"} from={1} />
              </div>
            </div>
          </motion.section>

          {/* every week */}
          <section aria-label="Your season" className="mt-8">
            <Kicker delay={T.list - 0.25}>Your season</Kicker>
            <ol className="mt-3 divide-y divide-white/[0.07] border-y border-white/[0.07]">
              {data.games.map((g, i) => (
                <motion.li
                  key={g.week}
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: T.list + i * ROW, duration: 0.5, ease: EASE }}
                  className="grid h-12 grid-cols-[2.25rem_auto_1fr_auto] items-center gap-x-3"
                >
                  <span className="font-display num text-2xl text-white/35">{g.week}</span>
                  <TeamAvatar team={g.opponent} size="sm" />
                  <span className="min-w-0 truncate text-[15px]">
                    <span className="text-white/40">{g.home ? "vs" : "@"}</span> {g.opponent.name}
                  </span>
                  <span className="num text-xs text-white/40">{g.starts}</span>
                </motion.li>
              ))}
            </ol>
          </section>

          {/* the playoffs */}
          <motion.section
            aria-label="Playoffs"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: T.playoffs, duration: 0.6, ease: EASE }}
            className="mt-8 overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-b from-amber-300/[0.1] to-transparent px-4 py-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <Kicker tone="amber">Playoffs</Kicker>
              <span className="text-xs text-amber-100/60">Top 4 · two weeks a round</span>
            </div>
            <ol className="mt-3 space-y-2.5">
              {data.rounds.map((r, i) => (
                <motion.li
                  key={r.name}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: T.playoffs + 0.3 + i * 0.18, duration: 0.5, ease: EASE }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-2xl leading-none">{r.name}</span>
                    <span className="num shrink-0 text-xs text-white/55">{r.dates}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-white/45">{r.note}</div>
                </motion.li>
              ))}
            </ol>
          </motion.section>

          <motion.button
            type="button"
            onClick={() => setClosing(true)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: T.button, duration: 0.5, ease: EASE }}
            className="btn-primary mt-8 w-full rounded-full px-6 py-3.5 text-base font-semibold transition active:scale-[0.98]"
          >
            Let&apos;s go
          </motion.button>
        </div>
      </motion.div>
    </MotionConfig>
  );
}

// A line of the title: slides up into view out of a mask (the classic cut-in), silver like the lottery's title.
function Word({ children, delay }: { children: string; delay: number }) {
  return (
    <span className="block overflow-hidden">
      <motion.span className="silver-text block" initial={{ y: "108%" }} animate={{ y: 0 }} transition={{ delay, duration: 0.95, ease: EASE }}>
        {children}
      </motion.span>
    </span>
  );
}

// One team of the opening matchup: its badge flies in from its side and lands with a spring; the name and
// Home / Away rise in under it.
function Side({ look, tag, from }: { look: Look; tag: string; from: -1 | 1 }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2.5 text-center">
      <motion.div
        initial={{ x: from * 150, opacity: 0, scale: 0.45 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 15, delay: T.hero }}
      >
        <TeamAvatar team={look} size="xl" />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: T.hero + 0.8, duration: 0.45, ease: EASE }} className="w-full min-w-0">
        <div className="truncate text-[15px] font-semibold">{look.name}</div>
        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{tag}</div>
      </motion.div>
    </div>
  );
}

function Kicker({ children, delay = 0, tone, center }: { children: React.ReactNode; delay?: number; tone?: "amber"; center?: boolean }) {
  return (
    <motion.h2
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.5 }}
      className={`text-[11px] font-semibold uppercase tracking-[0.3em] ${tone === "amber" ? "text-amber-200/80" : "text-white/50"} ${center ? "text-center" : ""}`}
    >
      {children}
    </motion.h2>
  );
}
