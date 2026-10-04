"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import TeamLogo from "./TeamLogo";
import { useScrollLock } from "./ScrollLock";

type Option = [value: string, label: string];
export type FilterValues = { show: string; mine: string; play: string; team: string; view: string };
const DEFAULTS: FilterValues = { show: "all", mine: "", play: "", team: "", view: "" };

// The Players filters, ESPN style: the button opens a sheet with one row per filter; a row opens its list of
// choices; nothing changes until Apply. `keep` is the rest of the address (position, sort) to carry along.
export default function PlayerFilters({ value, days, teams, keep, className }: {
  value: FilterValues; days: Option[]; teams: Option[]; keep: Record<string, string>; className: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  // The row whose choices are showing. `field` stays set after `inList` goes false, so the list slides away with
  // its content still in it.
  const [field, setField] = useState<keyof FilterValues>("show");
  const [inList, setInList] = useState(false);

  const fields: { key: keyof FilterValues; title: string; options: Option[] }[] = [
    { key: "show", title: "Availability", options: [["all", "All"], ["av", "Available"], ["fa", "Free agents"], ["wa", "Waivers"], ["owned", "Rostered"]] },
    { key: "play", title: "Playing", options: [["", "All"], ...days] },
    { key: "team", title: "Pro team", options: [["", "All teams"], ...teams] },
    { key: "view", title: "Stats", options: [["", "Averages"], ["tot", "Totals"]] },
  ];
  const current = fields.find((f) => f.key === field)!;
  const dirty = (Object.keys(DEFAULTS) as (keyof FilterValues)[]).some((k) => draft[k] !== DEFAULTS[k]);

  const show = () => {
    setDraft(value);
    setInList(false);
    setOpen(true);
  };
  const apply = () => {
    const q = new URLSearchParams(keep);
    for (const k of Object.keys(DEFAULTS) as (keyof FilterValues)[]) if (draft[k] !== DEFAULTS[k]) q.set(k, draft[k]);
    setOpen(false);
    router.push(q.size ? `/players?${q}` : "/players", { scroll: false });
  };

  useScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const head = "grid h-14 shrink-0 grid-cols-[3rem_1fr_3rem] items-center border-b border-line px-2";
  const title = "text-center text-[15px] font-black uppercase tracking-wide";
  const round = "flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-fg/[0.06] active:bg-fg/[0.1]";
  const row = "flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3.5 text-left active:bg-fg/[0.04]";

  return (
    <>
      <button type="button" onClick={show} aria-label="Filters" aria-haspopup="dialog" className={className}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Filters">
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="menu-dim absolute inset-0 cursor-default bg-black/50" />
            <div className="sheet-up relative flex h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl sm:h-[38rem] sm:max-w-md sm:rounded-2xl">
              {/* the rows */}
              <div className={`flex min-h-0 flex-1 flex-col transition-[translate,opacity] duration-300 ${inList ? "pointer-events-none -translate-x-1/4 opacity-0" : ""}`} aria-hidden={inList}>
                <div className={head}>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close" className={round}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                  <h2 className={title}>Filters</h2>
                  <button type="button" onClick={() => setDraft(DEFAULTS)} disabled={!dirty} className="justify-self-end pr-2 text-sm font-medium text-blue disabled:text-muted/60">Reset</button>
                </div>
                <div data-scrolls className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <button type="button" role="switch" aria-checked={draft.mine === ""} onClick={() => setDraft({ ...draft, mine: draft.mine === "" ? "0" : "" })} className={row}>
                    <span className="text-[17px]">Show my team</span>
                    <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${draft.mine === "" ? "bg-blue-fill" : "bg-line"}`}>
                      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] ${draft.mine === "" ? "left-[1.375rem]" : "left-0.5"}`} />
                    </span>
                  </button>
                  {fields.map((f) => (
                    <button key={f.key} type="button" onClick={() => { setField(f.key); setInList(true); }} className={row}>
                      <span className="min-w-0 leading-tight">
                        <span className="block text-[17px]">{f.title}</span>
                        <span className="block truncate text-sm text-muted">{f.options.find(([v]) => v === draft[f.key])?.[1] ?? f.options[0][1]}</span>
                      </span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 text-muted"><path d="m9 6 6 6-6 6" /></svg>
                    </button>
                  ))}
                </div>
                <div className="shrink-0 border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                  <button type="button" onClick={apply} className="w-full rounded-full bg-blue-fill py-3.5 text-base font-semibold text-white active:opacity-80">Apply filters</button>
                </div>
              </div>

              {/* one row's choices, sliding in over the rows */}
              <div className={`absolute inset-0 flex flex-col bg-card transition-[translate] duration-300 ${inList ? "" : "pointer-events-none translate-x-full"}`} aria-hidden={!inList}>
                <div className={head}>
                  <button type="button" onClick={() => setInList(false)} aria-label="Back" className={round}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4.5 7.5 12l7.5 7.5" /></svg>
                  </button>
                  <h2 className={title}>{current.title}</h2>
                  <span />
                </div>
                <div data-scrolls className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                  {current.options.map(([v, label]) => {
                    const on = draft[current.key] === v;
                    return (
                      <button key={v} type="button" onClick={() => { setDraft({ ...draft, [current.key]: v }); setInList(false); }} className={`${row} text-[17px] ${on ? "font-semibold" : ""}`}>
                        <span className="flex min-w-0 items-center gap-3">
                          {current.key === "team" && v && <TeamLogo abbr={v} px={48} className="h-6 w-6 shrink-0" />}
                          <span className="truncate">{label}</span>
                        </span>
                        {on && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-blue"><path d="m5 12 5 5 9-10" /></svg>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
