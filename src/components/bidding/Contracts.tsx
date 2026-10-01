"use client";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import type { Room } from "@/lib/bidding";
import { money } from "@/lib/rules";
import TeamAvatar from "@/components/TeamAvatar";
import * as A from "@/app/bidding/actions";
import PlayerCard from "./PlayerCard";
import { ease, Kicker } from "./ui";

const LENGTHS = [1, 2, 3, 4];

// After the last round: each GM spreads their contract slots (1 x 4 years, 2 x 3, 3 x 2) over their signings.
// Everything else is a 1 year deal. Then the board of every signing, by team.
export default function Contracts({ data }: { data: Room }) {
  const locked = data.phase === "done";
  const mine = data.signings.filter((s) => s.teamId === data.meId).sort((a, b) => b.salary - a.salary);
  const [years, setYears] = useState<Record<string, number>>(() => Object.fromEntries(mine.map((s) => [s.contractId, s.years])));
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const count = (n: number) => mine.filter((s) => (years[s.contractId] ?? s.years) === n).length;
  const dirty = mine.some((s) => (years[s.contractId] ?? s.years) !== s.years);

  const save = () =>
    start(async () => {
      const r = await A.setLengths(mine.map((s) => ({ contractId: s.contractId, years: years[s.contractId] ?? s.years })));
      setMsg(r?.error ?? "Saved");
    });

  const teams = data.teams.map((t) => ({ t, list: data.signings.filter((s) => s.teamId === t.id).sort((a, b) => b.salary - a.salary) })).filter((x) => x.list.length);

  return (
    <section className="mx-auto max-w-5xl px-4 pt-6">
      <Kicker>{locked ? "Free agency is done" : "Last step"}</Kicker>
      <h1 className="font-display mt-1 text-6xl leading-[0.85]">{locked ? "Signings" : "Contract lengths"}</h1>

      {!locked && mine.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {[4, 3, 2].map((n) => (
              <div key={n} className={`rounded-full border px-3.5 py-1.5 ${count(n) >= (data.limits[n] ?? 0) ? "border-[var(--gold)]/50 bg-[var(--gold)]/10" : "border-white/10 bg-white/[0.04]"}`}>
                <span className="font-display text-lg leading-none">{n} yr</span>
                <span className="ml-2 text-sm tabular-nums text-white/60">{count(n)}/{data.limits[n] ?? 0}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-2">
            {mine.map((s, i) => {
              const cur = years[s.contractId] ?? s.years;
              return (
                <motion.div
                  key={s.contractId}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, ease }}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5"
                >
                  <div className="w-14 shrink-0"><PlayerCard p={s.player} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{s.player.name}</div>
                    <div className="font-display text-2xl leading-none text-[var(--gold)]">{money(s.salary)}</div>
                  </div>
                  <div className="flex rounded-full bg-white/5 p-1">
                    {LENGTHS.map((n) => {
                      const full = n > 1 && cur !== n && count(n) >= (data.limits[n] ?? 0);
                      return (
                        <button
                          key={n}
                          disabled={full}
                          onClick={() => {
                            setMsg("");
                            setYears((y) => ({ ...y, [s.contractId]: n }));
                          }}
                          className="relative h-9 w-9 rounded-full text-sm font-semibold disabled:opacity-25"
                        >
                          {cur === n && <motion.span layoutId={`len-${s.contractId}`} className="absolute inset-0 rounded-full bg-[var(--gold)]" transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
                          <span className={`relative ${cur === n ? "text-black" : ""}`}>{n}y</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button disabled={pending || !dirty} onClick={save} className="gold-btn h-12 rounded-2xl px-8 font-bold transition active:scale-[0.98] disabled:opacity-40">
              {pending ? "Saving…" : "Save"}
            </button>
            {msg && <span className={`text-sm ${msg === "Saved" ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>{msg}</span>}
          </div>
        </>
      )}

      <Kicker className="mt-10">Every signing</Kicker>
      {!teams.length && <p className="mt-3 text-sm text-white/50">Nobody signed anyone.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {teams.map(({ t, list }) => (
          <div key={t.id} className={`rounded-2xl border p-4 ${t.id === data.meId ? "border-[var(--gold)]/40" : "border-white/10"} bg-white/[0.03]`}>
            <div className="flex items-center gap-3">
              <TeamAvatar name={t.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{t.name}</div>
                <div className="text-xs text-white/45">{money(list.reduce((a, s) => a + s.salary, 0))} on {list.length} {list.length === 1 ? "player" : "players"}</div>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {list.map((s) => (
                <li key={s.contractId} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-white/80">{s.player.name}</span>
                  <span className="shrink-0 tabular-nums text-white/55">{money(s.salary)} · {s.years}y</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
