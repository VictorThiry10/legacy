"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useScrollLock } from "@/components/ScrollLock";
import { draftRookie, rookieDraft } from "@/app/(league)/draft/actions";
import type { DraftBoard, DraftOptions } from "@/lib/draft";
import { gm } from "@/lib/lottery";
import { headshot } from "@/lib/names";
import { LENGTHS, ROOKIES, type Rookie } from "@/lib/rookies";
import { money } from "@/lib/rules";
import { display } from "./font";

const photo = (r: Rookie, h: number) => headshot(`https://a.espncdn.com/i/headshots/nba/players/full/${r.id}.png`, h)!;

// The rookie draft's pick screen, in two steps. The list: the eight with a price and every other rookie at the
// minimum; the ones already taken are dimmed, with the GM who took them. Then the player's own screen, where the
// GM chooses the contract length (lengths his team has no slot for are greyed out) and drafts him: that signs the
// contract, for good. While it's another GM's turn the list is only for looking, and keeps itself up to date.
// Opens from the lottery pop-up (if I hold the first pick) or from the Team page's row.
export default function RookiePick({ onClose }: { onClose: () => void }) {
  useScrollLock();
  const [data, setData] = useState<(DraftBoard & DraftOptions) | null>(null);
  const [choice, setChoice] = useState<Rookie | null>(null); // the rookie whose screen is open
  const [years, setYears] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [find, setFind] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<{ rookie: Rookie; years: number; slot: number } | null>(null);
  const [pending, start] = useTransition();

  // where the draft stands, asked again every few seconds: the GMs ahead of me are picking
  useEffect(() => {
    if (drafted) return;
    let live = true;
    const load = () => rookieDraft().then((d) => live && setData(d), () => {});
    load();
    const t = setInterval(load, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [drafted]);

  const taken = new Map((data?.picks ?? []).flatMap((p) => (p.player ? [[p.player, gm(p.team)] as const] : [])));
  const onClock = data?.picks.find((p) => p.slot === data.onClock);
  const open = data?.open ?? [];
  const closed = data ? LENGTHS.filter((y) => !open.includes(y)) : [];
  const player = drafted?.rookie ?? (data?.myTurn && choice && !taken.has(choice.id) ? choice : null);
  const length = years !== null && open.includes(years) ? years : null;
  const found = (data?.others ?? []).filter((r) => r.name.toLowerCase().includes(find.trim().toLowerCase()));
  const slot = drafted?.slot ?? data?.mine;

  const draft = () => {
    if (!player || !length || !data?.mine) return;
    const mine = data.mine;
    if (!window.confirm(`Draft ${player.name} for ${money(player.salary)}, ${length} year${length > 1 ? "s" : ""}? This is final.`)) return;
    start(async () => {
      setError(null);
      const r = await draftRookie(player.id, length).catch(() => ({ error: "Could not reach the server. Try again." }));
      if (r?.error) {
        setError(r.error);
        await rookieDraft().then(setData, () => {}); // someone may have just taken him
      } else setDrafted({ rookie: player, years: length, slot: mine });
    });
  };

  // A rookie's line. On my turn, one who is still there opens his own screen, to draft him. Any other time it
  // goes to his player page (closing this screen on the way).
  const row = (r: Rookie) => {
    const by = taken.get(r.id);
    const cls = `flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition active:scale-[0.99] ${by ? "opacity-35" : ""}`;
    const inner = (
      <>
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
      </>
    );
    return (
      <li key={r.id}>
        {data?.myTurn && !by ? (
          <button
            type="button"
            onClick={() => {
              setChoice(r);
              setYears(null);
              setError(null);
            }}
            className={cls}
          >
            {inner}
          </button>
        ) : (
          <Link href={`/players/${r.id}`} prefetch={false} transitionTypes={["nav-forward"]} onClick={onClose} className={cls}>{inner}</Link>
        )}
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
      <h1 className="font-display silver-text px-4 pt-[max(3.5rem,env(safe-area-inset-top))] text-center text-5xl leading-none">{slot ? `Pick #${slot}` : "Rookie Draft"}</h1>

      {/* the draft order: who has picked (dimmed), who is on the clock (lit) */}
      {data && !drafted && !player && (
        <ol aria-label="Draft order" className="mx-auto flex w-full max-w-md flex-wrap justify-center gap-1.5 px-4 pt-4">
          {data.picks.map((p) => (
            <li key={p.slot} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${p.slot === data.onClock ? "border-white bg-white/10" : "border-white/10"} ${p.player ? "opacity-40" : ""}`}>
              <span className="num text-white/50">{p.slot}</span>
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: gm(p.team).color }} />
              {gm(p.team).name}
            </li>
          ))}
        </ol>
      )}

      {player ? (
        <div key={player.id} data-scrolls className="mx-auto flex min-h-0 w-full max-w-md flex-1 animate-[fade_250ms_ease-out] flex-col items-center justify-center overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
          {/* his photo and name go to his player page */}
          <Link href={`/players/${player.id}`} prefetch={false} transitionTypes={["nav-forward"]} onClick={onClose} className="flex shrink-0 flex-col items-center">
            <img src={photo(player, 400)} alt="" className="h-44 w-60 object-cover object-top" />
            <span className="font-display mt-4 flex items-center gap-2 text-5xl leading-none">
              {player.name}
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 text-white/40"><path d="m9 6 6 6-6 6" /></svg>
            </span>
          </Link>
          <div className="num mt-2 text-sm text-white/50">
            {[player.position, player.nba, money(player.salary), drafted && `${drafted.years} year${drafted.years > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
          </div>
          {drafted ? (
            <button onClick={onClose} className="btn-primary mt-8 w-full rounded-full py-3.5 font-semibold">Done</button>
          ) : (
            <>
              <div className="mt-8 flex w-full items-center gap-2" role="group" aria-label="Contract length">
                <span className="mr-auto text-sm text-white/50">Years</span>
                {LENGTHS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    disabled={!open.includes(y) || pending}
                    aria-pressed={length === y}
                    onClick={() => setYears(y)}
                    className={`num h-11 w-14 rounded-full border text-base font-semibold transition disabled:opacity-25 ${length === y ? "border-white bg-white text-black" : "border-white/20 text-white/85"}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
              {closed.length > 0 && <p className="mt-2 w-full text-right text-xs text-white/40">No {closed.join(", ")} year slot left</p>}
              {error && <p role="alert" className="mt-3 w-full text-sm text-rose-400">{error}</p>}
              <button
                type="button"
                disabled={!length || pending}
                onClick={draft}
                className="btn-primary mt-6 w-full rounded-full py-3.5 font-semibold transition active:scale-[0.98] disabled:opacity-40"
              >
                {pending ? "Drafting…" : "Draft"}
              </button>
              <button type="button" disabled={pending} onClick={() => setChoice(null)} className="mt-1 w-full py-3 text-sm text-white/60">Back</button>
            </>
          )}
        </div>
      ) : (
        <>
          <ul data-scrolls className="mx-auto min-h-0 w-full max-w-md flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-5">
            {ROOKIES.map(row)}
            {data && data.others.length > 0 && (
              <li>
                <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex w-full items-center justify-between px-3 py-2 text-sm text-white/60">
                  <span>More rookies</span>
                  <span className="num">{money(data.others[0].salary)} {more ? "▴" : "▾"}</span>
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
          {data && !data.myTurn && onClock && (
            <p className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 text-center text-sm text-white/50">
              Waiting for #{onClock.slot} {gm(onClock.team).name}
            </p>
          )}
        </>
      )}
    </div>
  );
}
