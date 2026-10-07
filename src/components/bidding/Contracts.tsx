"use client";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Room } from "@/lib/bidding";
import { money } from "@/lib/rules";
import * as A from "@/app/bidding/actions";
import PlayerCard from "./PlayerCard";
import { ease, Gm, Label } from "./ui";

const MAX_YEARS = 4;
const yrs = (n: number) => `${n} ${n === 1 ? "yr" : "yrs"}`;
const LONG = [4, 3, 2]; // the lengths with a limit per season

// After the last round: each GM sets the length of this season's new contracts (the auction's signings start at
// 1 year; rookies and pickups keep what they were given) with + and −, within the limits (1 × 4 years, 2 × 3,
// 3 × 2). Last season's players keep their length and count by the seasons they have left (shown locked under
// the new ones). Going over a limit says so and blocks Save. Then the board of every new contract, by team.
export default function Contracts({ data }: { data: Room }) {
  const locked = data.phase === "done";
  const mine = data.signings.filter((s) => s.teamId === data.meId).sort((a, b) => b.salary - a.salary);
  const [years, setYears] = useState<Record<string, number>>(() => Object.fromEntries(mine.map((s) => [s.contractId, s.years])));
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const len = (id: string, fallback: number) => years[id] ?? fallback;
  const count = (n: number) => mine.filter((s) => len(s.contractId, s.years) === n).length + data.held.filter((h) => h.years === n).length;
  const dirty = mine.some((s) => len(s.contractId, s.years) !== s.years);
  const over = LONG.filter((n) => count(n) > (data.limits[n] ?? 0));

  const set = (id: string, n: number) => {
    setMsg("");
    setYears((y) => ({ ...y, [id]: Math.min(MAX_YEARS, Math.max(1, n)) }));
  };
  const save = () =>
    start(async () => {
      const r = await A.setLengths(mine.map((s) => ({ contractId: s.contractId, years: len(s.contractId, s.years) })));
      setMsg(r?.error ?? "Saved");
    });

  const teams = data.teams.map((t) => ({ t, list: data.signings.filter((s) => s.teamId === t.id).sort((a, b) => b.salary - a.salary) })).filter((x) => x.list.length);

  return (
    <section className="mx-auto max-w-5xl px-4 pt-6">
      <h1 className="font-display text-6xl leading-[0.85]">{locked ? "Signings" : "Contract lengths"}</h1>

      {!locked && mine.length > 0 && (
        <>
          <div className="mt-5 flex gap-6">
            {LONG.map((n) => {
              const bad = count(n) > (data.limits[n] ?? 0);
              return (
                <div key={n}>
                  <Label>{n} years</Label>
                  <div className={`font-display mt-1 text-2xl leading-none ${bad ? "text-[var(--bad)]" : ""}`}>
                    {count(n)}<span className={bad ? "text-[var(--bad)]/60" : "text-white/30"}>/{data.limits[n] ?? 0}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl bg-white/[0.025] ring-1 ring-inset ring-white/[0.06]">
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
              <span className="flex-1">Player</span>
              <span className="hidden w-16 text-right sm:block">Salary</span>
              <span className="w-[7.5rem] text-center">Length</span>
            </div>
            {mine.map((s, i) => {
              const cur = len(s.contractId, s.years);
              const bad = over.includes(cur);
              return (
                <motion.div
                  key={s.contractId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, ease }}
                  className="flex items-center gap-3 border-b border-white/[0.04] px-3 py-2.5 last:border-0"
                >
                  <div className="w-10 shrink-0"><PlayerCard p={s.player} size="thumb" /></div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[15px] font-semibold">{s.player.name}</div>
                    <div className="truncate text-xs text-white/40">
                      <span className="font-semibold text-[var(--gold)] sm:hidden">{money(s.salary)} · </span>
                      {[s.player.position?.replace(/,\s*/g, "/"), s.player.nbaTeam].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="font-display hidden w-16 text-right text-2xl leading-none text-[var(--gold)] sm:block">{money(s.salary)}</div>
                  <div className={`flex w-[7.5rem] items-center justify-between rounded-full p-1 ${bad ? "bg-[var(--bad)]/15 ring-1 ring-inset ring-[var(--bad)]/50" : "bg-white/[0.05]"}`}>
                    <Step label="−" aria={`Shorter contract for ${s.player.name}`} disabled={cur <= 1} onClick={() => set(s.contractId, cur - 1)} />
                    <span className={`text-sm font-semibold tabular-nums ${bad ? "text-[var(--bad)]" : ""}`}>{yrs(cur)}</span>
                    <Step label="+" aria={`Longer contract for ${s.player.name}`} disabled={cur >= MAX_YEARS} onClick={() => set(s.contractId, cur + 1)} />
                  </div>
                </motion.div>
              );
            })}
            {data.held.map((h) => {
              const bad = over.includes(h.years);
              return (
                <div key={h.contractId} className="flex items-center gap-3 border-b border-white/[0.04] px-3 py-2.5 opacity-55 last:border-0">
                  <div className="w-10 shrink-0"><PlayerCard p={h.player} size="thumb" /></div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[15px] font-semibold">{h.player.name}</div>
                    <div className="truncate text-xs text-white/40">
                      <span className="font-semibold text-[var(--gold)] sm:hidden">{money(h.salary)} · </span>
                      {[h.player.position?.replace(/,\s*/g, "/"), h.player.nbaTeam].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="font-display hidden w-16 text-right text-2xl leading-none text-[var(--gold)] sm:block">{money(h.salary)}</div>
                  <div className={`flex w-[7.5rem] items-center justify-center gap-1.5 text-sm font-semibold tabular-nums ${bad ? "text-[var(--bad)]" : ""}`}>
                    <LockIcon />
                    {yrs(h.years)}
                  </div>
                </div>
              );
            })}
          </div>

          <AnimatePresence>
            {over.map((n) => (
              <motion.p
                key={n}
                role="alert"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 text-sm text-[var(--bad)]"
              >
                Too many {n} year contracts: {count(n)}, the limit is {data.limits[n] ?? 0}. Shorten {count(n) - (data.limits[n] ?? 0) === 1 ? "one" : count(n) - (data.limits[n] ?? 0)}.
              </motion.p>
            ))}
          </AnimatePresence>

          <div className="mt-4 flex items-center gap-3">
            <button disabled={pending || !dirty || over.length > 0} onClick={save} className="btn-primary h-12 rounded-2xl px-8 font-semibold transition active:scale-[0.98] disabled:opacity-30">
              {pending ? "Saving…" : "Save"}
            </button>
            {msg && <span className={`text-sm ${msg === "Saved" ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>{msg}</span>}
          </div>
        </>
      )}

      <Label className="mt-10">Every signing</Label>
      {!teams.length && <p className="mt-3 text-sm text-white/50">Nobody signed anyone.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {teams.map(({ t, list }) => (
          <div key={t.id} className={`rounded-2xl p-4 ${t.id === data.meId ? "bg-white/[0.06] ring-1 ring-inset ring-white/15" : "bg-white/[0.025]"}`}>
            <div className="flex items-center gap-3">
              <Gm team={t.look} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{t.name}</div>
                <div className="text-xs text-white/45">{money(list.reduce((a, s) => a + s.salary, 0))} on {list.length} {list.length === 1 ? "player" : "players"}</div>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {list.map((s) => (
                <li key={s.contractId} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-white/80">{s.player.name}</span>
                  <span className="shrink-0 tabular-nums text-white/50">{money(s.salary)} · {yrs(s.years)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Already signed">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

function Step({ label, aria, disabled, onClick }: { label: string; aria: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={aria}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.07] text-lg font-light leading-none transition active:scale-90 active:bg-white/20 disabled:opacity-25"
    >
      {label}
    </button>
  );
}
