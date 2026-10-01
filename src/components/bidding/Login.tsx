"use client";
import { useActionState } from "react";
import { motion, MotionConfig } from "motion/react";
import { signIn } from "@/app/bidding/actions";
import { CardBack } from "./PlayerCard";

const ease = [0.22, 1, 0.36, 1] as const;

// Email only: GMs type the email linked to their team and they're in.
// The form is there from the first paint (no fade in); only the card fan animates. The cards bob with a CSS float.
export default function Login() {
  const [state, run, pending] = useActionState(signIn, undefined);
  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 py-12">
        <div className="relative mb-10 h-48 w-56">
          {[-14, 0, 14].map((r, i) => (
            <motion.div
              key={r}
              className="bid-float absolute left-1/2 top-0 w-28"
              initial={{ opacity: 0, y: 60, rotate: 0, x: "-50%" }}
              animate={{ opacity: 1, y: 0, rotate: r, x: `calc(-50% + ${r * 4}px)` }}
              transition={{ opacity: { duration: 0.6, delay: i * 0.1 }, default: { duration: 0.9, delay: 0.2 + i * 0.1, ease } }}
              style={{ zIndex: i === 1 ? 2 : 1, animationDelay: `${i * 0.4}s`, "--float": "-6px" } as React.CSSProperties}
            >
              <CardBack />
            </motion.div>
          ))}
        </div>
        <div className="w-full text-center">
          <h1 className="font-display silver-text text-7xl leading-none">Legacy</h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.45em] text-white/40">Free agency</p>
          <form action={run} className="mt-10 space-y-3">
            <input
              name="email" type="email" required autoComplete="email" inputMode="email" placeholder="Your email"
              className="h-14 w-full rounded-2xl bg-white/[0.06] px-5 text-center text-lg outline-none ring-1 ring-inset ring-white/10 transition focus:bg-white/10 focus:ring-white/30"
            />
            <button disabled={pending} className="btn-primary h-14 w-full rounded-2xl text-lg font-semibold transition active:scale-[0.98] disabled:opacity-60">
              {pending ? "Signing in…" : "Sign in"}
            </button>
            {state?.error && <p className="text-sm text-[var(--bad)]">{state.error}</p>}
          </form>
        </div>
      </div>
    </MotionConfig>
  );
}
