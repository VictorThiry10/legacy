"use client";
import { useEffect, useRef, useState } from "react";
import { Bebas_Neue } from "next/font/google";
import { AnimatePresence, motion } from "motion/react";
import { useScrollLock } from "@/components/ScrollLock";
import Machine, { type MachineApi } from "./Machine";
import { drawOrder, randomField } from "./teams";

// Same display face as the bidding site. Not preloaded: only whoever gets the pop-up downloads it.
const display = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-display", preload: false });

type Pick = { id: string; ball: number };

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const pct = (n: number) => `${n % 1 ? n.toFixed(1) : n}%`;

// A team's ball as a small chip, for lists.
function Chip({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${color} 45%, white), ${color} 55%, color-mix(in srgb, ${color} 55%, black))` }}
    />
  );
}

// The rookie draft lottery as a full screen show over the league app: the odds first, then Play runs the drum.
// TEST for now: random odds (teams.ts) and a draw made in this browser, so nobody else sees the same order.
export default function Lottery({ onClose }: { onClose: () => void }) {
  const machine = useRef<MachineApi>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const run = useRef(0); // bumped by Run again and on close, so a show in progress stops
  const [teams, setTeams] = useState(randomField);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const byId = Object.fromEntries(teams.map((t, i) => [t.id, { ...t, slot: i + 1 }]));
  const totalBalls = teams.reduce((a, t) => a + t.balls.length, 0);

  useScrollLock(); // the app behind stays still; the pop-up itself scrolls (data-scrolls)

  // Escape closes. Leaving stops a draw in progress.
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && setClosing(true);
    window.addEventListener("keydown", key);
    const runs = run;
    return () => {
      window.removeEventListener("keydown", key);
      runs.current++;
    };
  }, []);

  // Closing fades out, then leaves. On a timer, so it doesn't hang on an animation the browser has paused.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 250);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  async function play() {
    const m = machine.current;
    if (!m || phase !== "idle") return;
    const me = ++run.current;
    const live = () => run.current === me;
    const order = drawOrder(teams);
    setHover(null);
    setPhase("running");
    scroller.current?.scrollTo({ top: 0, behavior: "smooth" }); // on a phone the drum takes over the screen
    for (let k = 0; k < order.length; k++) {
      const last = k === order.length - 1;
      setDrawing(true);
      if (k > 0) m.clearCup();
      // the first pick gets the long mix; the last team left needs none
      if (!last) {
        m.mix(1);
        await wait(k === 0 ? 3800 : 1400);
        if (!live()) return;
      }
      const ball = await m.draw(order[k]);
      if (!live()) return;
      m.mix(last ? 0 : 0.2);
      setDrawing(false);
      setPicks((p) => [...p, { id: order[k], ball }]);
      await wait(last ? 1600 : k === 0 ? 2800 : 1400);
      if (!live()) return;
      m.drain(order[k]);
      if (!last) await wait(500);
      if (!live()) return;
    }
    m.clearCup(); // every ball is out; the caption names the #1 pick
    setPhase("done");
    scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  // New random odds, back to the start. The drum refills when it gets the new teams.
  function again() {
    run.current++;
    setTeams(randomField());
    setPicks([]);
    setDrawing(false);
    setPhase("idle");
  }

  const latest = picks.at(-1);
  const caption =
    phase === "idle" ? "idle" : drawing ? `drawing-${picks.length}` : phase === "done" ? "done" : `pick-${picks.length}`;

  return (
    <motion.div
      ref={scroller}
      role="dialog"
      aria-modal="true"
      aria-label="Rookie draft lottery"
      data-scrolls
      className={`${display.variable} bid-bg fixed inset-0 z-[60] overflow-y-auto overscroll-contain text-white`}
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

      {/* Phone: one thing at a time (odds, then the drum, then the order). Wider: the drum on the left throughout. */}
      <div className="mx-auto grid max-w-5xl items-start gap-x-12 gap-y-6 px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))] sm:px-6 md:grid-cols-2 md:grid-rows-[auto_1fr]">
        <header className={`text-center md:col-start-2 md:text-left ${phase === "running" ? "hidden md:block" : ""}`}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Legacy League</div>
          <h1 className="font-display silver-text mt-1 text-[2.5rem] leading-none sm:text-6xl">Rookie Draft Lottery</h1>
          <div className="mt-3 inline-block rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.2em] text-white/60">Test · random odds</div>
        </header>

        <section aria-label="Lottery machine" className={`mx-auto w-full max-w-[420px] md:col-start-1 md:row-span-2 md:row-start-1 ${phase === "idle" ? "hidden md:block" : ""}`}>
          {/* a hovered row lights up its team's balls; only while the odds are showing */}
          <div className={phase === "done" ? "hidden md:block" : ""}>
            <Machine ref={machine} teams={teams} highlight={phase === "idle" ? hover : null} />
          </div>
          {/* What just happened, right under the drum so it's in view on a phone too */}
          <div aria-live="polite" className="relative mt-2 flex h-24 items-center justify-center text-center">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={caption}
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {phase === "idle" && <p className="text-sm text-white/50">{totalBalls} balls in the drum. One colour per team.</p>}
                {phase === "running" && drawing && (
                  <p className="font-display text-3xl text-white/70">
                    Drawing pick #{picks.length + 1}
                    <span className="inline-block w-6 animate-pulse text-left">…</span>
                  </p>
                )}
                {latest && !drawing && phase !== "idle" && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
                      {phase === "done" ? "The #1 pick" : `Pick #${picks.length} · ball ${latest.ball}`}
                    </div>
                    <div className="font-display text-6xl leading-none" style={{ color: byId[(phase === "done" ? picks[0] : latest).id].color }}>
                      {byId[(phase === "done" ? picks[0] : latest).id].name}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        <section className="w-full md:col-start-2">
          <AnimatePresence mode="wait" initial={false}>
            {phase === "idle" ? (
              <motion.div key="odds" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                <h2 className="font-display text-3xl">Odds at the #1 pick</h2>
                <ul className="mt-4 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                  {teams.map((t) => (
                    <li
                      key={t.id}
                      className="grid cursor-default grid-cols-[auto_1fr_auto] items-center gap-x-3 py-2 sm:py-2.5"
                      onMouseEnter={() => setHover(t.id)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <Chip color={t.color} size={18} />
                      <div className="min-w-0">
                        <div className="font-medium">{t.name}</div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                          <div className="h-full rounded-full" style={{ width: `${(t.odds / teams[0].odds) * 100}%`, background: t.color }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-display num text-2xl leading-none">{pct(t.odds)}</div>
                        <div className="num mt-0.5 text-[11px] text-white/40">
                          {t.balls.length > 1 ? `balls ${t.balls[0]}–${t.balls.at(-1)}` : `ball ${t.balls[0]}`}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <button onClick={play} className="btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold transition active:scale-[0.98]">
                  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 fill-current"><path d="M4 2.5v11l9-5.5z" /></svg>
                  Play
                </button>
                <p className="mt-3 text-xs leading-relaxed text-white/40">
                  The first ball out of the drum picks #1. That team&rsquo;s other balls come out, and the next ball picks #2, and so on down to #{teams.length}.
                </p>
              </motion.div>
            ) : (
              <motion.div key="order" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <h2 className="font-display text-3xl">{phase === "done" ? "Final draft order" : "Draft order"}</h2>
                <ol className="mt-4 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                  {teams.map((_, k) => {
                    const p = picks[k];
                    const t = p && byId[p.id];
                    const moved = t ? t.slot - (k + 1) : 0;
                    return (
                      <li key={k} className="grid h-11 grid-cols-[2rem_1fr_auto] items-center gap-x-3 sm:h-12">
                        <span className="font-display num text-2xl text-white/40">{k + 1}</span>
                        {t ? (
                          <motion.div className="flex min-w-0 items-center gap-2.5" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
                            <Chip color={t.color} size={16} />
                            <span className="truncate font-medium">{t.name}</span>
                            <span className="num text-xs text-white/40">ball {p.ball} · {pct(t.odds)}</span>
                          </motion.div>
                        ) : (
                          <span className={`text-sm ${drawing && k === picks.length ? "animate-pulse text-white/60" : "text-white/20"}`}>
                            {drawing && k === picks.length ? "Drawing…" : "—"}
                          </span>
                        )}
                        {t && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className={`num text-xs font-semibold ${moved > 0 ? "text-emerald-400" : moved < 0 ? "text-rose-400" : "text-white/30"}`}
                            title={`Rank by odds before the draw: ${t.slot}`}
                          >
                            {moved > 0 ? `▲ ${moved}` : moved < 0 ? `▼ ${-moved}` : "—"}
                          </motion.span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {phase === "done" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 grid grid-cols-2 gap-3">
                    <button onClick={again} className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/5">
                      Run again
                    </button>
                    <button onClick={() => setClosing(true)} className="btn-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold">
                      Close
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </motion.div>
  );
}
