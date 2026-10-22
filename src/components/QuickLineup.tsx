"use client";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { setQuickLineup } from "@/app/(league)/team/actions";
import { dayName } from "@/lib/dates";
import { useScrollLock } from "./ScrollLock";

// ESPN's Quick Lineup: a button next to the stats view, a sheet with two choices (this day, or the rest of the
// matchup) and Confirm. The server starts the highest projected players who have a game (team/actions.ts).
export default function QuickLineup({ day, today, until }: { day: string; today: string; until: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-accent py-2 text-sm font-semibold text-accent hover:bg-accent/10"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /></svg>
        Quick lineup
      </button>
      {/* on <body>: the page slides, which would trap it */}
      {open && createPortal(<Sheet day={day} today={today} until={until} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Sheet({ day, today, until, onClose }: { day: string; today: string; until: string | null; onClose: () => void }) {
  useScrollLock();
  const router = useRouter();
  const [to, setTo] = useState(day);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const options = [
    { to: day, title: day === today ? "Today" : dayName(day), sub: day === today ? dayName(day) : "That day only" },
    ...(until ? [{ to: until, title: "Rest of matchup", sub: `${dayName(day)} to ${dayName(until)}` }] : []),
  ];
  const confirm = () =>
    start(async () => {
      const r = await setQuickLineup(day, to);
      if (r?.error) return setError(r.error);
      onClose();
      router.refresh(); // the new lineup
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="quick-title">
      <button type="button" aria-label="Cancel" onClick={onClose} className="menu-dim absolute inset-0 cursor-default bg-black/50" />
      <div className="sheet-up relative w-full max-w-md rounded-t-2xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 id="quick-title" className="text-lg font-semibold">Quick lineup</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-muted hover:bg-line">×</button>
        </div>
        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Which days">
          {options.map((o) => {
            const on = o.to === to;
            return (
              <button
                key={o.to} type="button" role="radio" aria-checked={on} onClick={() => setTo(o.to)}
                className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left transition-colors ${on ? "border-accent bg-accent/10" : "border-line hover:bg-line/40"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-accent" : "border-muted"}`}>
                  {on && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                </span>
                <span className="leading-tight">
                  <span className="block font-semibold">{o.title}</span>
                  <span className="block text-sm text-muted">{o.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-muted">Starts your highest projected players who have a game. Players whose game has started, and IR, stay put.</p>
        {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
        <button type="button" onClick={confirm} disabled={pending} className="btn mt-4 w-full py-3 text-base">{pending ? "Setting…" : "Confirm"}</button>
      </div>
    </div>
  );
}
