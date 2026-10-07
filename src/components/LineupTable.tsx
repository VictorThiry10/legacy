"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { canPlay, isStarter, slotLabel, swap, type LineupPlayer, type LineupRow } from "@/lib/lineup";
import { moveSlot } from "@/app/(league)/team/actions";

// One player's row content, prepared on the server: name cell, stat cells, and what the move rules need.
export type LinePlayer = LineupPlayer & { name: string; headshot: string | null; locked: boolean; info: React.ReactNode; cells: React.ReactNode };

// The lineup table. Moving a player happens on screen at once: tap his slot pill, then a lit slot.
// The save runs in the background; if the server says no, the lineup snaps back and shows why.
export default function LineupTable({ rows, players, head, empty, day, editable }: {
  rows: LineupRow[]; players: Record<string, LinePlayer>; head: React.ReactNode; empty: React.ReactNode; day: string; editable: boolean;
}) {
  const [shown, show] = useOptimistic(rows, (_: LineupRow[], next: LineupRow[]) => next);
  const [move, setMove] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState<string[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, start] = useTransition();
  const moving = move ? players[move] : undefined;
  const movingFrom = shown.find((r) => r.playerId === move)?.slot;

  const drop = (to: string) => {
    if (!move || !movingFrom) return;
    const next = swap(shown, move, to, new Map(Object.entries(players)));
    setMove(null);
    if (typeof next === "string") return setErr(next);
    setErr("");
    setFlash([movingFrom, to]);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash([]), 700);
    const playerId = move;
    start(async () => {
      show(next);
      const r = await moveSlot(day, playerId, to);
      if (r?.error) setErr(r.error);
    });
  };

  return (
    <>
      {err && <p className="card text-sm text-bad">{err}</p>}
      {moving && <p className="text-sm text-accent">Moving {moving.name}</p>}
      <div className="-mx-4 overflow-x-auto border-y border-line bg-card sm:mx-0 sm:rounded-2xl sm:border">
        <table className="t whitespace-nowrap text-[13px] [&_td]:py-1.5 [&_th]:py-2">
          {head}
          <tbody>
            {shown.map((r, i) => {
              const p = r.playerId ? players[r.playerId] : undefined;
              const here =
                !!moving && !!movingFrom && r.slot !== movingFrom && r.slot !== "BE" && canPlay(moving, r.slot) &&
                (!p || (canPlay(p, movingFrom) && !p.locked));
              const firstBench = !isStarter(r.slot) && (i === 0 || isStarter(shown[i - 1].slot));
              const picked = !!p && p.id === move;
              const state = !editable ? "off" : picked ? "moving" : here ? "target" : p && !move && !p.locked ? "tap" : p?.locked ? "locked" : "off";
              return (
                <tr
                  key={`${r.slot}-${i}`}
                  className={`transition-colors duration-500 ${firstBench ? "[&>td]:border-t-2" : ""} ${picked ? "bg-line/50" : flash.includes(r.slot) ? "bg-accent/10" : ""}`}
                >
                  {/* slot button and photo stay put when the table scrolls sideways */}
                  <td className={`sticky left-0 z-10 [transform:translateZ(0)] shadow-[2px_0_3px_-2px_rgba(0,0,0,0.25)] transition-colors duration-500 ${picked ? "bg-line" : "bg-card"}`}>
                    <div className="flex items-center gap-2">
                      <SlotButton
                        label={slotLabel(r.slot)}
                        state={state}
                        onClick={() => {
                          setErr("");
                          if (state === "target") drop(r.slot);
                          else if (state === "moving") setMove(null);
                          else if (state === "tap" && p) setMove(p.id);
                        }}
                      />
                      {p?.headshot ? <img src={p.headshot} alt="" decoding="async" className="block h-7 w-7 max-w-none shrink-0 rounded-full bg-line object-cover" /> : <span className="block h-7 w-7 shrink-0 rounded-full bg-line" />}
                    </div>
                  </td>
                  <td>{p ? p.info : <span className="text-muted">Empty</span>}</td>
                  {p ? p.cells : empty}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// The slot pill (ESPN style) is the move control: tap to pick a player up, tap a lit slot to drop him there.
function SlotButton({ label, state, onClick }: { label: string; state: "off" | "tap" | "moving" | "target" | "locked"; onClick: () => void }) {
  const pill = "inline-flex h-7 min-w-12 items-center justify-center whitespace-nowrap rounded-full border-[1.5px] px-2.5 text-[11px] font-bold transition-[background-color,color,transform] duration-150 active:scale-95";
  if (state === "target") return <button type="button" onClick={onClick} className={`${pill} border-accent bg-accent text-bg`} aria-label={`Move here (${label})`}>{label}</button>;
  if (state === "moving") return <button type="button" onClick={onClick} className={`${pill} border-accent bg-accent/20 text-accent`} aria-label="Cancel move">{label}</button>;
  if (state === "tap") return <button type="button" onClick={onClick} className={`${pill} border-accent text-accent hover:bg-accent/10`} aria-label={`Move (${label})`}>{label}</button>;
  return (
    <span className={`${pill} border-line text-muted active:scale-100`} title={state === "locked" ? "Locked: his game has started" : undefined}>
      {label}{state === "locked" && " 🔒"}
    </span>
  );
}
