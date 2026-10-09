"use client";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { assignLengths } from "@/app/(league)/lengths/actions";
import type { LengthChoice } from "@/lib/pick-lengths";
import { money } from "@/lib/rules";
import PlayerCard from "./bidding/PlayerCard";
import PendingRow, { ContractIcon } from "./PendingRow";
import { useScrollLock } from "./ScrollLock";

const MAX_YEARS = 4;
const LONG = [4, 3, 2]; // the lengths with a limit
const yrs = (n: number) => `${n} ${n === 1 ? "yr" : "yrs"}`;

// The Team page's "Assign contract length" row (Pending.tsx): a GM who was given players at a set salary chooses how
// long each contract runs. The pop-up is the picker from the end of free agency (bidding/Contracts.tsx): + and −
// per player, the counts against the limits (1 x 4 years, 2 x 3, 3 x 2) on top, his other long contracts locked
// underneath. Going over a limit says so and blocks Save. Saving is final.
export default function AssignLengthsRow({ choice }: { choice: LengthChoice }) {
  const [open, setOpen] = useState(false);
  const n = choice.deals.length;
  return (
    <>
      <PendingRow onClick={() => setOpen(true)} icon={<ContractIcon />} title="Assign contract length" sub={`${n} player${n === 1 ? "" : "s"}`} action="Assign" />
      {/* on <body>: the page slides, which would trap it */}
      {open && createPortal(<Sheet choice={choice} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Sheet({ choice, onClose }: { choice: LengthChoice; onClose: () => void }) {
  useScrollLock();
  const router = useRouter();
  const [years, setYears] = useState<Record<string, number>>(() => Object.fromEntries(choice.deals.map((d) => [d.contractId, d.years])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const count = (n: number) => choice.deals.filter((d) => years[d.contractId] === n).length + choice.held.filter((h) => h.years === n).length;
  const over = LONG.filter((n) => count(n) > (choice.limits[n] ?? 0));
  const set = (id: string, n: number) => {
    setError(null);
    setYears((y) => ({ ...y, [id]: Math.min(MAX_YEARS, Math.max(1, n)) }));
  };
  const save = () => {
    const list = choice.deals.map((d) => `${d.player.name} ${yrs(years[d.contractId])}`).join(", ");
    if (!window.confirm(`${list}? This is final.`)) return;
    start(async () => {
      const r = await assignLengths(choice.deals.map((d) => ({ contractId: d.contractId, years: years[d.contractId] })));
      if (r?.error) return setError(r.error);
      onClose();
      router.refresh(); // the new lengths on the roster, and the row goes
    });
  };

  const row = "flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0";
  const sub = (d: LengthChoice["deals"][number]) => `${money(d.salary)} · ${[d.player.position?.replace(/,\s*/g, "/"), d.player.nbaTeam].filter(Boolean).join(" · ")}`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="lengths-title">
      <button type="button" aria-label="Decide later" onClick={onClose} className="menu-dim absolute inset-0 cursor-default bg-black/50" />
      <div className="sheet-up relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-end justify-between gap-3 p-5 pb-3">
          <h2 id="lengths-title" className="text-lg font-semibold">Contract lengths</h2>
          <div className="flex gap-3 text-sm tabular-nums">
            {LONG.map((n) => (
              <span key={n} className={over.includes(n) ? "font-semibold text-bad" : "text-muted"}>{n}y {count(n)}/{choice.limits[n] ?? 0}</span>
            ))}
          </div>
        </div>

        <div data-scrolls className="mx-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-line">
          {choice.deals.map((d) => {
            const cur = years[d.contractId];
            const bad = over.includes(cur);
            return (
              <div key={d.contractId} className={row}>
                <div className="w-10 shrink-0"><PlayerCard p={d.player} size="thumb" /></div>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[15px] font-semibold">{d.player.name}</div>
                  <div className="truncate text-xs text-muted">{sub(d)}</div>
                </div>
                <div className={`flex w-[7.5rem] shrink-0 items-center justify-between rounded-full p-1 ${bad ? "bg-bad/10 ring-1 ring-inset ring-bad/40" : "bg-fg/[0.06]"}`}>
                  <Step label="−" aria={`Shorter contract for ${d.player.name}`} disabled={pending || cur <= 1} onClick={() => set(d.contractId, cur - 1)} />
                  <span className={`text-sm font-semibold tabular-nums ${bad ? "text-bad" : ""}`}>{yrs(cur)}</span>
                  <Step label="+" aria={`Longer contract for ${d.player.name}`} disabled={pending || cur >= MAX_YEARS} onClick={() => set(d.contractId, cur + 1)} />
                </div>
              </div>
            );
          })}
          {choice.held.map((h) => (
            <div key={h.contractId} className={`${row} opacity-50`}>
              <div className="w-10 shrink-0"><PlayerCard p={h.player} size="thumb" /></div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[15px] font-semibold">{h.player.name}</div>
                <div className="truncate text-xs text-muted">{sub(h)}</div>
              </div>
              <div className={`flex w-[7.5rem] shrink-0 items-center justify-center gap-1.5 text-sm font-semibold tabular-nums ${over.includes(h.years) ? "text-bad" : ""}`}>
                <LockIcon />
                {yrs(h.years)}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {over.map((n) => (
            <p key={n} role="alert" className="text-xs text-bad">Too many {n} year contracts: {count(n)}, the limit is {choice.limits[n] ?? 0}.</p>
          ))}
          {error && <p className="text-xs text-bad">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="btn-ghost">Later</button>
            <button type="button" onClick={save} disabled={pending || over.length > 0} className="btn flex-1">{pending ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Already signed">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

function Step({ label, aria, disabled, onClick }: { label: string; aria: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={aria} disabled={disabled} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-full bg-card text-lg font-light leading-none shadow-sm transition active:scale-90 disabled:opacity-25">
      {label}
    </button>
  );
}
