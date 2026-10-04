"use client";
import { useState } from "react";
import { useScrollLock } from "@/components/ScrollLock";
import { headshot } from "@/lib/names";
import { money } from "@/lib/rules";
import { display } from "./font";
import { ME } from "./teams";
import { ROOKIES, saveDraft, useDraft, type Rookie } from "./draft";

const photo = (r: Rookie, h: number) => headshot(`https://a.espncdn.com/i/headshots/nba/players/full/${r.id}.png`, h)!;

// Pick your rookie: the class with who's gone, one tap, one button. Opens from the lottery pop-up (if I pick #1)
// or from the Team page's row. TEST for now: the pick stays in this browser (draft.ts).
export default function RookiePick({ onClose }: { onClose: () => void }) {
  useScrollLock();
  const draft = useDraft(ME);
  const [choice, setChoice] = useState<string | null>(null);
  if (!draft) return null;
  const { d, myPick, onClock, myTurn, taken } = draft;
  const mine = ROOKIES.find((r) => r.id === d.mine);
  const chosen = myTurn ? ROOKIES.find((r) => r.id === choice && !taken.has(r.id)) : undefined;

  return (
    <div role="dialog" aria-modal="true" aria-label="Rookie draft" className={`${display.variable} bid-bg fixed inset-0 z-[70] flex animate-[fade_250ms_ease-out] flex-col text-white`} style={{ colorScheme: "dark" }}>
      <button
        onClick={onClose}
        aria-label="Close"
        className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur transition hover:bg-white/20"
      >
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 stroke-current" fill="none" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
      </button>
      <h1 className="font-display silver-text px-4 pt-[max(3.5rem,env(safe-area-inset-top))] text-center text-5xl leading-none">Pick #{myPick}</h1>

      {mine ? (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
          <img src={photo(mine, 400)} alt="" className="h-44 w-60 object-cover object-top" />
          <div className="font-display mt-4 text-5xl leading-none">{mine.name}</div>
          <div className="num mt-2 text-sm text-white/50">{[mine.position, mine.nba, money(mine.salary)].join(" · ")}</div>
          <button onClick={onClose} className="btn-primary mt-8 w-full rounded-full py-3.5 font-semibold">Done</button>
        </div>
      ) : (
        <>
          <ul data-scrolls className="mx-auto min-h-0 w-full max-w-md flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-5">
            {ROOKIES.map((r) => {
              const by = taken.get(r.id);
              const on = chosen?.id === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={!!by}
                    aria-pressed={on}
                    onClick={() => myTurn && setChoice(r.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition active:scale-[0.99] disabled:opacity-35 ${on ? "border-white bg-white/10" : "border-white/10 bg-white/[0.03]"}`}
                  >
                    <img src={photo(r, 130)} alt="" decoding="async" className="h-11 w-11 shrink-0 rounded-full bg-white/10 object-cover object-top" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-xs text-white/45">{r.position} · {r.nba}</span>
                    </span>
                    {by ? (
                      <span className="flex items-center gap-1.5 text-sm text-white/70">
                        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: by.color }} />
                        {by.name}
                      </span>
                    ) : (
                      <span className="font-display num text-2xl leading-none">{money(r.salary)}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
            <button
              type="button"
              disabled={!chosen}
              onClick={() => chosen && saveDraft({ ...d, mine: chosen.id })}
              className="btn-primary w-full rounded-full py-3.5 font-semibold transition active:scale-[0.98] disabled:opacity-40"
            >
              {!myTurn ? `Waiting for #${onClock} ${d.order[onClock - 1]?.name}` : chosen ? `Draft ${chosen.name}` : "Pick a rookie"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
