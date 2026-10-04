"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useScrollLock } from "@/components/ScrollLock";
import { drawLottery } from "@/lib/rules";
import Machine, { type MachineApi } from "./Machine";
import RookiePick from "./RookiePick";
import { saveDraft } from "./draft";
import { display } from "./font";
import { ME, randomField } from "./teams";

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const pct = (n: number) => `${n % 1 ? n.toFixed(1) : n}%`;

// A team's colour as a small ball, for lists.
function Chip({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${color} 45%, white), ${color} 55%, color-mix(in srgb, ${color} 55%, black))` }}
    />
  );
}

// The rookie draft lottery as a full screen show over the league app: the odds, then Play. The draw is the league's
// (rules.ts, like the NBA's) and is made up front; the show reveals it last pick first: the picks set by record,
// then for each lottery pick the drum draws its four balls and the team is named, #1 last.
// TEST for now: random odds (teams.ts) and a draw made in this browser, so nobody else sees the same order.
export default function Lottery({ onClose }: { onClose: () => void }) {
  const machine = useRef<MachineApi>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const run = useRef(0); // bumped by Again and on close, so a show in progress stops
  const [teams, setTeams] = useState(randomField);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [draw, setDraw] = useState<{ order: string[]; top: number }>({ order: [], top: 0 }); // top: how many picks the balls decide
  const [shown, setShown] = useState(0); // picks from this one down the board are revealed
  const [drawing, setDrawing] = useState<number | null>(null); // the pick whose balls are coming out
  const [closing, setClosing] = useState(false);
  const [picking, setPicking] = useState(false); // the rookie pick screen, if I got #1
  const byId = Object.fromEntries(teams.map((t, i) => [t.id, { ...t, slot: i + 1 }]));
  const teamAt = (pick: number) => byId[draw.order[pick - 1]];
  const latest = phase !== "idle" && drawing === null && shown <= draw.order.length ? teamAt(shown) : undefined;

  useScrollLock(); // the app behind stays still; the pop-up itself scrolls (data-scrolls)

  // Escape closes. Leaving stops a show in progress.
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
    // TEST: drawn again until I hold #1, to try the pick screen. The odds on screen stay the random ones.
    const odds = Object.fromEntries(teams.map((t) => [t.id, t.odds]));
    let result = drawLottery(teams.map((t) => t.id), Math.random, odds);
    while (result.order[0] !== ME) result = drawLottery(teams.map((t) => t.id), Math.random, odds);
    const { order, combos } = result;
    setDraw({ order, top: combos.length });
    setShown(order.length + 1);
    setPhase("running");
    scroller.current?.scrollTo({ top: 0, behavior: "smooth" }); // on a phone the drum takes over the screen
    m.mix(0.45);
    // the picks set by record, last first
    for (let p = order.length; p > combos.length; p--) {
      await wait(1200);
      if (!live()) return;
      setShown(p);
    }
    // the lottery picks, up to #1: the four balls, then the team
    for (let p = combos.length; p >= 1; p--) {
      await wait(1200);
      if (!live()) return;
      setDrawing(p);
      m.back();
      m.mix(1);
      await wait(p === 1 ? 2600 : 1500);
      if (!live()) return;
      // one ball every 0.8 s; the outer places fill first, so no ball passes through another
      await Promise.all(combos[p - 1].map((n, k) => wait(k * 800).then(() => m.draw(n, [0, 3, 1, 2][k]))));
      if (!live()) return;
      m.mix(0.35);
      await wait(p === 1 ? 1300 : 600);
      if (!live()) return;
      setShown(p);
      setDrawing(null);
      await wait(600);
    }
    await wait(1600);
    if (!live()) return;
    m.mix(0);
    setPhase("done");
    scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
    // the draft starts: #1 is on the clock (the Team page's row and the pick screen read this)
    saveDraft({ order: order.map((id) => ({ name: byId[id].name, color: byId[id].color })), at: Date.now() });
  }

  // New random odds, back to the start.
  function again() {
    run.current++;
    machine.current?.back();
    machine.current?.mix(0);
    saveDraft(null);
    setTeams(randomField());
    setDraw({ order: [], top: 0 });
    setDrawing(null);
    setPhase("idle");
  }

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
          <h1 className="font-display silver-text text-[2.5rem] leading-none sm:text-6xl">Rookie Draft Lottery</h1>
          <div className="mt-2 inline-block rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.2em] text-white/60">Test</div>
        </header>

        <section aria-label="Lottery machine" className={`mx-auto w-full max-w-[420px] md:col-start-1 md:row-span-2 md:row-start-1 ${phase === "idle" ? "hidden md:block" : ""}`}>
          {/* the tray's four balls take the team's colour once it's named */}
          <div className={phase === "done" ? "hidden md:block" : "animate-[fade_500ms_ease-out]"}>
            <Machine ref={machine} tint={latest && shown <= draw.top ? latest.color : null} />
          </div>
          {/* The pick being revealed, right under the drum so it's in view on a phone too */}
          <div aria-live="polite" className="relative mt-2 flex h-24 items-center justify-center text-center">
            <AnimatePresence mode="wait" initial={false}>
              {drawing !== null ? (
                <motion.div key={`drawing-${drawing}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="font-display num text-5xl leading-none text-white/35">
                  #{drawing}
                </motion.div>
              ) : latest ? (
                <motion.div
                  key={`pick-${shown}`}
                  initial={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ type: "spring", stiffness: 220, damping: 22 }}
                >
                  <div className="font-display num text-2xl leading-none text-white/50">#{shown}</div>
                  <div className="font-display text-6xl leading-none" style={{ color: latest.color }}>{latest.name}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </section>

        <section className="w-full md:col-start-2">
          <AnimatePresence mode="wait" initial={false}>
            {phase === "idle" ? (
              <motion.div key="odds" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">#1 pick odds</h2>
                <ul className="mt-3 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                  {teams.map((t) => (
                    <li key={t.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 py-2.5">
                      <Chip color={t.color} size={18} />
                      <div className="min-w-0">
                        <div className="font-medium">{t.name}</div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                          <div className="h-full rounded-full" style={{ width: `${(t.odds / teams[0].odds) * 100}%`, background: t.color }} />
                        </div>
                      </div>
                      <div className="font-display num text-2xl leading-none">{pct(t.odds)}</div>
                    </li>
                  ))}
                </ul>
                <button onClick={play} className="btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold transition active:scale-[0.98]">
                  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 fill-current"><path d="M4 2.5v11l9-5.5z" /></svg>
                  Play
                </button>
              </motion.div>
            ) : (
              <motion.div key="order" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                {/* the board fills from the bottom: the last pick is revealed first */}
                <ol className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                  {draw.order.map((id, k) => {
                    const t = k + 1 >= shown ? byId[id] : undefined;
                    const moved = t ? t.slot - (k + 1) : 0;
                    return (
                      <li key={k} className={`grid h-11 grid-cols-[2rem_1fr_auto] items-center gap-x-3 px-2 transition-colors duration-700 sm:h-12 ${t && drawing === null && k + 1 === shown && phase === "running" ? "bg-white/[0.06]" : ""}`}>
                        <span className="font-display num text-2xl text-white/40">{k + 1}</span>
                        {t ? (
                          <motion.div className="flex min-w-0 items-center gap-2.5" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
                            <Chip color={t.color} size={16} />
                            <span className="truncate font-medium">{t.name}</span>
                          </motion.div>
                        ) : (
                          <span className={`h-px w-10 transition-colors duration-500 ${drawing === k + 1 ? "bg-white/50" : "bg-white/10"}`} />
                        )}
                        {t && moved !== 0 && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className={`num text-xs font-semibold ${moved > 0 ? "text-emerald-400" : "text-rose-400"}`}
                          >
                            {moved > 0 ? `▲ ${moved}` : `▼ ${-moved}`}
                          </motion.span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {phase === "done" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 grid grid-cols-2 gap-3">
                    <button onClick={again} className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/80 transition hover:bg-white/5">
                      Again
                    </button>
                    {draw.order[0] === ME ? (
                      <button onClick={() => setPicking(true)} className="btn-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold">
                        Pick your rookie
                      </button>
                    ) : (
                      <button onClick={() => setClosing(true)} className="btn-primary inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold">
                        Close
                      </button>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
      {picking && <RookiePick onClose={() => setClosing(true)} />}
    </motion.div>
  );
}
