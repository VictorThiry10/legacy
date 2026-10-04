"use client";
import { useEffect, useState } from "react";
import { useScrollLock } from "@/components/ScrollLock";
import { draftOptions } from "@/app/(league)/draft/actions";
import { headshot } from "@/lib/names";
import { money } from "@/lib/rules";
import { display } from "./font";
import { ME } from "./teams";
import { saveDraft, useDraft } from "./draft";
import { LENGTHS, ROOKIES, type DraftOptions, type Rookie } from "./rookies";

const photo = (r: Rookie, h: number) => headshot(`https://a.espncdn.com/i/headshots/nba/players/full/${r.id}.png`, h)!;

// Pick your rookie, in two steps. The list: the eight with a price (who's gone is dimmed) and every other rookie
// at the minimum. Then the player's own screen, where the GM chooses the contract length (the lengths the team has
// no slot for are greyed out) and drafts him. Opens from the lottery pop-up (if I pick #1) or from the Team page's
// row. TEST for now: the pick stays in this browser (draft.ts).
export default function RookiePick({ onClose }: { onClose: () => void }) {
  useScrollLock();
  const draft = useDraft(ME);
  const [options, setOptions] = useState<DraftOptions | null>(null);
  const [choice, setChoice] = useState<Rookie | null>(null); // the rookie whose screen is open
  const [years, setYears] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [find, setFind] = useState("");
  useEffect(() => {
    draftOptions().then(setOptions, () => setOptions({ others: [], open: [1] })); // if it fails: the eight, 1 year
  }, []);
  if (!draft) return null;
  const { d, myPick, onClock, myTurn, taken } = draft;
  const open = options?.open ?? [];
  const closed = options ? LENGTHS.filter((y) => !open.includes(y)) : [];
  const player = d.mine ?? (myTurn && choice && !taken.has(choice.id) ? choice : null);
  const length = years !== null && open.includes(years) ? years : null;
  const found = (options?.others ?? []).filter((r) => r.name.toLowerCase().includes(find.trim().toLowerCase()));

  const row = (r: Rookie) => {
    const by = taken.get(r.id);
    return (
      <li key={r.id}>
        <button
          type="button"
          disabled={!!by}
          onClick={() => {
            if (!myTurn) return;
            setChoice(r);
            setYears(null);
          }}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition active:scale-[0.99] disabled:opacity-35"
        >
          <img src={photo(r, 130)} alt="" loading="lazy" decoding="async" className="h-11 w-11 shrink-0 rounded-full bg-white/10 object-cover object-top" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{r.name}</span>
            <span className="block truncate text-xs text-white/45">{[r.position, r.nba].filter(Boolean).join(" · ")}</span>
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
  };

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

      {player ? (
        <div key={player.id} data-scrolls className="mx-auto flex min-h-0 w-full max-w-md flex-1 animate-[fade_250ms_ease-out] flex-col items-center justify-center overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
          <img src={photo(player, 400)} alt="" className="h-44 w-60 shrink-0 object-cover object-top" />
          <div className="font-display mt-4 text-5xl leading-none">{player.name}</div>
          <div className="num mt-2 text-sm text-white/50">
            {[player.position, player.nba, money(player.salary), d.mine && `${d.mine.years} year${d.mine.years > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
          </div>
          {d.mine ? (
            <button onClick={onClose} className="btn-primary mt-8 w-full rounded-full py-3.5 font-semibold">Done</button>
          ) : (
            <>
              <div className="mt-8 flex w-full items-center gap-2" role="group" aria-label="Contract length">
                <span className="mr-auto text-sm text-white/50">Years</span>
                {LENGTHS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    disabled={!open.includes(y)}
                    aria-pressed={length === y}
                    onClick={() => setYears(y)}
                    className={`num h-11 w-14 rounded-full border text-base font-semibold transition disabled:opacity-25 ${length === y ? "border-white bg-white text-black" : "border-white/20 text-white/85"}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
              {closed.length > 0 && <p className="mt-2 w-full text-right text-xs text-white/40">No {closed.join(", ")} year slot left</p>}
              <button
                type="button"
                disabled={!length}
                onClick={() => length && saveDraft({ ...d, mine: { ...player, years: length } })}
                className="btn-primary mt-6 w-full rounded-full py-3.5 font-semibold transition active:scale-[0.98] disabled:opacity-40"
              >
                Draft
              </button>
              <button type="button" onClick={() => setChoice(null)} className="mt-1 w-full py-3 text-sm text-white/60">Back</button>
            </>
          )}
        </div>
      ) : (
        <>
          <ul data-scrolls className="mx-auto min-h-0 w-full max-w-md flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-5">
            {ROOKIES.map(row)}
            {options && options.others.length > 0 && (
              <li>
                <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex w-full items-center justify-between px-3 py-2 text-sm text-white/60">
                  <span>More rookies</span>
                  <span className="num">{money(options.others[0].salary)} {more ? "▴" : "▾"}</span>
                </button>
              </li>
            )}
            {more && (
              <li>
                <input
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Search"
                  aria-label="Search rookies"
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-base outline-none placeholder:text-white/30 focus:border-white/40"
                />
              </li>
            )}
            {more && found.map(row)}
          </ul>
          {!myTurn && (
            <p className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 text-center text-sm text-white/50">
              Waiting for #{onClock} {d.order[onClock - 1]?.name}
            </p>
          )}
        </>
      )}
    </div>
  );
}
