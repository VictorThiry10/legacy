"use client";
import { useEffect, useEffectEvent } from "react";
import { useAnimate } from "motion/react";
import { BALL, CENTRE_Y, EXIT_Y } from "./Machine";

const GROW = 4; // how much bigger the ball is in the middle than in the drum
const SHELL = "radial-gradient(circle at 34% 31%, #ffffff 0%, #eeeef2 60%, #9c9caa 100%)";

// The reveal of one pick. The ball the drum just let out of its tube (Machine.tsx hands it over at the same spot
// and size) flies to the middle growing, shakes, and opens: its halves come apart and the GM's name is inside.
// Sits on top of the drum, in the same box. `long`: a longer shake, for the #1 pick. `onOpen`: the moment it opens.
export default function Capsule({ pick, name, color, long, onOpen }: { pick: number; name: string; color: string; long: boolean; onOpen: () => void }) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const opened = useEffectEvent(onOpen);

  useEffect(() => {
    let live = true;
    (async () => {
      await animate("[data-ball]", { top: [`${EXIT_Y * 100}%`, `${CENTRE_Y * 100}%`], scale: [1 / GROW, 1] }, { type: "spring", stiffness: 110, damping: 16 });
      await animate("[data-ball]", { rotate: long ? [0, -6, 6, -9, 9, -12, 12, -6, 6, 0] : [0, -8, 8, -5, 5, 0] }, { duration: long ? 1.6 : 0.6, ease: "easeInOut" });
      if (!live) return;
      opened();
      const apart = { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] as const };
      animate("[data-top]", { y: "-90%", rotate: -22, opacity: 0 }, apart);
      animate("[data-bottom]", { y: "70%", rotate: 12, opacity: 0 }, apart);
      animate("[data-glow]", { opacity: [0, 1, 0.55], scale: [0.5, 1.2, 1] }, { duration: 0.8, ease: "easeOut" });
      animate("[data-name]", { opacity: [0, 1], scale: [0.7, 1], filter: ["blur(10px)", "blur(0px)"] }, { duration: 0.5, ease: "easeOut" });
    })();
    return () => {
      live = false;
    };
  }, [animate, long]);

  const at = { top: `${CENTRE_Y * 100}%` };
  return (
    <div ref={scope} className="pointer-events-none absolute inset-0">
      <div
        data-glow
        aria-hidden
        className="absolute left-1/2 aspect-square w-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
        style={{ ...at, background: `radial-gradient(circle, ${color}70 0%, ${color}26 38%, transparent 68%)` }}
      />
      <div
        data-ball
        aria-hidden
        className="absolute left-1/2 aspect-square -translate-x-1/2 -translate-y-1/2"
        style={{ width: `${BALL * GROW * 100}%`, top: `${EXIT_Y * 100}%`, transform: `scale(${1 / GROW})` }}
      >
        <div data-top className="absolute inset-x-0 top-0 h-1/2 overflow-hidden">
          <div className="h-[200%] rounded-full" style={{ background: SHELL }} />
        </div>
        <div data-bottom className="absolute inset-x-0 bottom-0 h-1/2 overflow-hidden border-t-2 border-black/40">
          <div className="absolute inset-x-0 bottom-0 h-[200%] rounded-full" style={{ background: `linear-gradient(rgba(24,24,44,0.14), rgba(24,24,44,0.14)), ${SHELL}` }} />
        </div>
      </div>
      <div data-name className="absolute inset-x-0 -translate-y-1/2 text-center opacity-0" style={at}>
        <div className="font-display num text-3xl leading-none text-white/60">#{pick}</div>
        <div className="font-display text-7xl leading-none drop-shadow-[0_2px_18px_rgba(0,0,0,0.7)]" style={{ color }}>{name}</div>
      </div>
    </div>
  );
}
