"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { FORWARD } from "../Slide";
import type { Room } from "@/lib/bidding";
import { money } from "@/lib/rules";
import * as A from "@/app/(league)/bidding/actions";
import PlayerCard from "./PlayerCard";
import { BTN, GHOST, Gm, PRIMARY } from "./ui";

const MAX_YEARS = 4;
const yrs = (n: number) => `${n} ${n === 1 ? "yr" : "yrs"}`;
const LONG = [4, 3, 2]; // the lengths with a limit per season

// After the last round: each GM sets the length of this season's new contracts (the auction's signings start at
// 1 year; rookies and pickups keep what they were given) with + and −, within the limits (1 × 4 years, 2 × 3,
// 3 × 2). Last season's players keep their length and count by the seasons they have left (shown locked under
// the new ones). Going over a limit says so and blocks Save. Then the board of every new contract, by team.
// The commissioner locks everyone's lengths at the bottom.
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
  const act = (fn: () => Promise<{ error?: string } | void>, done = "Saved", ask?: string) => () => {
    if (ask && !window.confirm(ask)) return;
    start(async () => {
      const r = await fn();
      setMsg(r?.error ?? done);
    });
  };

  const teams = data.teams.map((t) => ({ t, list: data.signings.filter((s) => s.teamId === t.id).sort((a, b) => b.salary - a.salary) })).filter((x) => x.list.length);
  const row = "flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0";
  const sub = (p: { position: string | null; nbaTeam: string | null }, salary: number) => `${money(salary)} · ${[p.position?.replace(/,\s*/g, "/"), p.nbaTeam].filter(Boolean).join(" · ")}`;

  return (
    <>
      {!locked && mine.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-xl font-semibold">Contract lengths</h2>
            <div className="flex gap-4 text-sm tabular-nums">
              {LONG.map((n) => {
                const bad = count(n) > (data.limits[n] ?? 0);
                return <span key={n} className={bad ? "font-semibold text-bad" : "text-muted"}>{n}y {count(n)}/{data.limits[n] ?? 0}</span>;
              })}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-card">
            {mine.map((s) => {
              const cur = len(s.contractId, s.years);
              const bad = over.includes(cur);
              return (
                <div key={s.contractId} className={row}>
                  <div className="w-10 shrink-0"><PlayerCard p={s.player} size="thumb" /></div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <Link href={`/players/${s.player.id}`} transitionTypes={FORWARD} className="block truncate text-[15px] font-semibold">{s.player.name}</Link>
                    <div className="truncate text-xs text-muted">{sub(s.player, s.salary)}</div>
                  </div>
                  <div className={`flex w-[7.5rem] items-center justify-between rounded-full p-1 ${bad ? "bg-bad/10 ring-1 ring-inset ring-bad/40" : "bg-fg/[0.06]"}`}>
                    <Step label="−" aria={`Shorter contract for ${s.player.name}`} disabled={cur <= 1} onClick={() => set(s.contractId, cur - 1)} />
                    <span className={`text-sm font-semibold tabular-nums ${bad ? "text-bad" : ""}`}>{yrs(cur)}</span>
                    <Step label="+" aria={`Longer contract for ${s.player.name}`} disabled={cur >= MAX_YEARS} onClick={() => set(s.contractId, cur + 1)} />
                  </div>
                </div>
              );
            })}
            {data.held.map((h) => (
              <div key={h.contractId} className={`${row} opacity-50`}>
                <div className="w-10 shrink-0"><PlayerCard p={h.player} size="thumb" /></div>
                <div className="min-w-0 flex-1 leading-tight">
                  <Link href={`/players/${h.player.id}`} transitionTypes={FORWARD} className="block truncate text-[15px] font-semibold">{h.player.name}</Link>
                  <div className="truncate text-xs text-muted">{sub(h.player, h.salary)}</div>
                </div>
                <div className={`flex w-[7.5rem] items-center justify-center gap-1.5 text-sm font-semibold tabular-nums ${over.includes(h.years) ? "text-bad" : ""}`}>
                  <LockIcon />
                  {yrs(h.years)}
                </div>
              </div>
            ))}
          </div>
          <AnimatePresence>
            {over.map((n) => (
              <motion.p key={n} role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-sm text-bad">
                Too many {n} year contracts: {count(n)}, the limit is {data.limits[n] ?? 0}.
              </motion.p>
            ))}
          </AnimatePresence>
          <div className="flex items-center gap-3">
            <button
              disabled={pending || !dirty || over.length > 0}
              onClick={act(() => A.setLengths(mine.map((s) => ({ contractId: s.contractId, years: len(s.contractId, s.years) }))))}
              className={`${BTN} px-6 py-2.5`}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {msg && <span className={`text-sm ${msg === "Saved" ? "text-good" : "text-bad"}`}>{msg}</span>}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{locked ? "Signings" : "Every signing"}</h2>
        {!teams.length && <p className="text-sm text-muted">Nobody signed anyone.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map(({ t, list }) => (
            <div key={t.id} className={`rounded-xl border bg-card p-4 ${t.id === data.meId ? "border-crimson/40" : "border-line"}`}>
              <div className="flex items-center gap-3">
                <Gm team={t.look} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{t.name}</div>
                  <div className="text-xs text-muted">{money(list.reduce((a, s) => a + s.salary, 0))} on {list.length} {list.length === 1 ? "player" : "players"}</div>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {list.map((s) => (
                  <li key={s.contractId} className="flex items-baseline justify-between gap-3">
                    <Link href={`/players/${s.player.id}`} transitionTypes={FORWARD} className="truncate">{s.player.name}</Link>
                    <span className="shrink-0 tabular-nums text-muted">{money(s.salary)} · {yrs(s.years)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {data.isCommish && (
          <div className="flex items-center gap-3 pt-2">
            {locked ? (
              <button disabled={pending} onClick={act(() => A.lockContracts(false), "Unlocked")} className={`${GHOST} px-5 py-2.5`}>Unlock contracts</button>
            ) : (
              <button disabled={pending} onClick={act(() => A.lockContracts(true), "Locked", "Lock everyone's contract lengths?")} className={PRIMARY}>
                Lock contracts
              </button>
            )}
            {msg && (msg === "Locked" || msg === "Unlocked") && <span className="text-sm text-good">{msg}</span>}
          </div>
        )}
      </section>
    </>
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
      className="grid h-8 w-8 place-items-center rounded-full bg-card text-lg font-light leading-none shadow-sm transition active:scale-90 disabled:opacity-25"
    >
      {label}
    </button>
  );
}
