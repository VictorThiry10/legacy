"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useScrollLock } from "@/components/ScrollLock";
import { playRookieLottery, watchedRookieLottery } from "@/app/(league)/draft/actions";
import { gm, type LotteryTeam } from "@/lib/lottery";
import Capsule from "./Capsule";
import Machine, { type MachineApi } from "./Machine";
import RookiePick from "./RookiePick";
import { display } from "./font";

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

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

// The rookie draft lottery as a full screen show over the league app: the odds, then Play. Play asks the server
// for the draft order (drawn once, for everybody: lib/draft.ts) and the show reveals it last pick first. For every
// pick a ball is drawn from the drum, comes to the middle, opens, and the GM's name is inside (Capsule.tsx).
// `field`: the teams, worst record first, with their odds.
export default function Lottery({ field, onClose }: { field: LotteryTeam[]; onClose: () => void }) {
  const machine = useRef<MachineApi>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const run = useRef(0); // bumped on close, so a show in progress stops
  const opened = useRef<(() => void) | null>(null); // the ball on screen has just opened
  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "done">("idle");
  const [order, setOrder] = useState<string[]>([]); // the draw: team ids, #1 first
  const [shown, setShown] = useState(0); // picks from this one down the board are revealed
  const [drawing, setDrawing] = useState<number | null>(null); // the pick whose ball is on its way
  const [reveal, setReveal] = useState<number | null>(null); // the pick whose ball is in the middle of the screen
  const [error, setError] = useState<string | null>(null);
  const [myTurn, setMyTurn] = useState(false); // after the show: I hold the first pick
  const [closing, setClosing] = useState(false);
  const [picking, setPicking] = useState(false);
  // The places a team's record gave it before the draw (teams level on record share theirs): moving out of them is the news.
  const places = (id: string) => {
    const mine = field.find((t) => t.id === id);
    const tied = field.map((t, i) => (t.record === mine?.record ? i + 1 : 0)).filter(Boolean);
    return { first: Math.min(...tied), last: Math.max(...tied) };
  };

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
    setError(null);
    setPhase("loading");
    const drawn = await playRookieLottery().catch(() => ({ error: "Could not reach the server. Try again." }));
    if (!live()) return;
    if ("error" in drawn || !drawn.order.length) {
      setError("error" in drawn ? drawn.error : "The lottery isn't ready yet.");
      setPhase("idle");
      return;
    }
    const picks = drawn.order;
    setOrder(picks);
    setShown(picks.length + 1);
    setPhase("running");
    scroller.current?.scrollTo({ top: 0, behavior: "smooth" }); // on a phone the drum takes over the screen
    // last pick first, up to #1. The picks the balls decide (the top four) get a longer mix.
    for (let p = picks.length; p >= 1; p--) {
      setDrawing(p);
      m.mix(1);
      await wait(p === 1 ? 2800 : p <= 4 ? 1500 : 1100);
      if (!live()) return;
      await m.draw();
      if (!live()) return;
      m.mix(0.3);
      const open = new Promise<void>((done) => (opened.current = done));
      setReveal(p); // the ball flies to the middle, shakes, opens
      await open;
      if (!live()) return;
      setShown(p);
      setDrawing(null);
      await wait(p === 1 ? 2400 : 1500);
      if (!live()) return;
      if (p > 1) {
        setReveal(null);
        await wait(300);
      }
    }
    m.mix(0);
    // watched: the pop-up won't open again, and the draft's row appears on the Team page
    const after = await watchedRookieLottery().catch(() => ({ myTurn: false }));
    if (!live()) return;
    setMyTurn(after.myTurn);
    setPhase("done"); // #1's name stays up
    scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  const showing = phase === "running" || phase === "done";
  return (
    <motion.div
      ref={scroller}
      role="dialog"
      aria-modal="true"
      aria-label="Rookie draft lottery"
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

      {/* Phone: one thing at a time (odds, then the drum, then the order). Wider: the drum on the left throughout. */}
      <div className={`mx-auto grid max-w-5xl items-start gap-x-12 gap-y-6 px-4 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-6 md:grid-cols-2 md:grid-rows-[auto_1fr] md:pt-[max(3.5rem,env(safe-area-inset-top))] ${phase === "running" ? "pt-[max(1rem,env(safe-area-inset-top))]" : "pt-[max(3.5rem,env(safe-area-inset-top))]"}`}>
        <header className={`text-center md:col-start-2 md:text-left ${phase === "running" ? "hidden md:block" : ""}`}>
          <h1 className="font-display silver-text text-[2.5rem] leading-none sm:text-6xl">Rookie Draft Lottery</h1>
        </header>

        {/* On a phone the drum is sized by the screen's height, so the whole board fits under it. */}
        <section aria-label="Lottery machine" className={`mx-auto w-full max-w-[min(420px,42dvh)] md:col-start-1 md:row-span-2 md:row-start-1 md:max-w-[420px] ${phase === "running" ? "" : "hidden md:block"}`}>
          <div className="relative animate-[fade_500ms_ease-out]">
            <div className={`transition-opacity duration-500 ${reveal !== null ? "opacity-25" : ""}`}>
              <Machine ref={machine} count={field.length} />
            </div>
            {/* the ball that was just drawn, over the dimmed drum */}
            <div aria-live="polite">
              <AnimatePresence>
                {reveal !== null && (
                  <motion.div key={reveal} className="absolute inset-0" exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <Capsule pick={reveal} name={gm(order[reveal - 1]).name} color={gm(order[reveal - 1]).color} long={reveal === 1} onOpen={() => opened.current?.()} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

        <section className="w-full md:col-start-2">
          <AnimatePresence mode="wait" initial={false}>
            {!showing ? (
              <motion.div key="odds" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">#1 pick odds</h2>
                <ul className="mt-3 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                  {field.map((t) => (
                    <li key={t.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 py-2.5">
                      <Chip color={t.color} size={18} />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium">{t.name}</span>
                          <span className="num text-xs text-white/40">{t.record}</span>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                          <div className="h-full rounded-full" style={{ width: `${(t.odds / field[0].odds) * 100}%`, background: t.color }} />
                        </div>
                      </div>
                      <div className="font-display num text-2xl leading-none">{pct(t.odds)}</div>
                    </li>
                  ))}
                </ul>
                <button onClick={play} disabled={phase !== "idle"} className="btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold transition active:scale-[0.98] disabled:opacity-60">
                  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 fill-current"><path d="M4 2.5v11l9-5.5z" /></svg>
                  Play
                </button>
                {error && <p role="alert" className="mt-3 text-center text-sm text-rose-400">{error}</p>}
              </motion.div>
            ) : (
              <motion.div key="order" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                {/* the board fills from the bottom: the last pick is revealed first */}
                <ol className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                  {order.map((id, k) => {
                    const t = k + 1 >= shown ? gm(id) : undefined;
                    const was = places(id);
                    const moved = !t ? 0 : k + 1 < was.first ? was.first - (k + 1) : k + 1 > was.last ? was.last - (k + 1) : 0;
                    return (
                      <li key={k} className={`grid h-10 grid-cols-[2rem_1fr_auto] items-center gap-x-3 px-2 transition-colors duration-700 sm:h-12 ${t && drawing === null && k + 1 === shown && phase === "running" ? "bg-white/[0.06]" : ""}`}>
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
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
                    <button onClick={() => (myTurn ? setPicking(true) : setClosing(true))} className="btn-primary inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-base font-semibold">
                      {myTurn ? "Pick your rookie" : "Close"}
                    </button>
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
