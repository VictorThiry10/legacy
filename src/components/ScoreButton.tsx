"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ScoreRow = { label: string; per: number; n: number; score: number };

// A player's fantasy points for one game. Tap it for the breakdown, ESPN style: each scoring category, what one is
// worth, how many he had and what that adds up to.
export default function ScoreButton({ points, name, headshot, game, rows, className = "" }: {
  points: number; name: string; headshot: string | null; game: string; rows: ScoreRow[]; className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const one = (n: number) => n.toFixed(1);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${name}: ${one(points)} points, see the breakdown`} className={`num text-[15px] font-semibold active:opacity-60 ${className}`}>
        {one(points)}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${name} scoring`}>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="menu-dim absolute inset-0 cursor-default bg-black/55" />
            <div className="menu-pop relative mt-10 w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-line">
              <div className="-mt-10 flex justify-center">
                {headshot
                  ? <img src={headshot} alt="" className="h-20 w-20 rounded-full bg-line object-cover ring-4 ring-card" />
                  : <span className="h-20 w-20 rounded-full bg-line ring-4 ring-card" />}
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-fg/[0.06] active:bg-fg/[0.1]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
              <div className="px-4 pb-4 pt-2 text-center">
                <div className="text-lg font-semibold">{name}</div>
                <div className="text-sm text-muted">{game}</div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-line text-[11px] font-semibold uppercase tracking-wide">
                    <th className="py-2 pl-4 text-left font-semibold">Scoring category</th>
                    <th className="px-2 py-2 text-right font-semibold">Pts per</th>
                    <th className="px-2 py-2 text-right font-semibold">#</th>
                    <th className="py-2 pl-2 pr-4 text-right font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-b border-line/70">
                      <td className="py-2.5 pl-4">{r.label}</td>
                      <td className="num px-2 py-2.5 text-right text-muted">{r.per}</td>
                      <td className="num px-2 py-2.5 text-right text-muted">{r.n}</td>
                      <td className={`num py-2.5 pl-2 pr-4 text-right font-semibold ${r.score < 0 ? "text-bad" : ""}`}>{one(r.score)}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr className="border-b border-line/70"><td colSpan={4} className="py-3 pl-4 text-muted">Nothing on the stat sheet.</td></tr>}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={3} className="rounded-bl-2xl bg-fg/[0.04] py-3 pl-4 uppercase">Total</td>
                    <td className="num rounded-br-2xl bg-fg/[0.04] py-3 pl-2 pr-4 text-right">{one(points)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
