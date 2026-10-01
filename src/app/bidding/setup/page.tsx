import Link from "next/link";
import { redirect } from "next/navigation";
import { bidTeam, PER_ROUND, searchFreeAgents, setupRounds } from "@/lib/bidding";
import { getSettings, teamSummaries } from "@/lib/league";
import { money } from "@/lib/rules";
import ActionForm from "@/components/ActionForm";
import TeamAvatar from "@/components/TeamAvatar";
import PlayerCard from "@/components/bidding/PlayerCard";
import { Kicker } from "@/components/bidding/ui";
import * as A from "../actions";

export const dynamic = "force-dynamic";

// Commissioner: which free agents go in which round, the GMs who can sign in, and a restart for test runs.
export default async function Setup({ searchParams }: PageProps<"/bidding/setup">) {
  const team = await bidTeam();
  if (!team?.is_commish) redirect("/bidding");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const [rounds, results, { leagueSize }, teams] = await Promise.all([setupRounds(), searchFreeAgents(q), getSettings(), teamSummaries()]);
  const open = (n: number) => rounds.find((r) => r.number === n)!;
  const canAdd = (n: number) => open(n).status === "setup" && open(n).players.length < PER_ROUND;
  const btn = "rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-40";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Link href="/bidding" className="text-sm text-white/55 hover:text-white">← Room</Link>
      <h1 className="font-display mt-2 text-6xl leading-[0.85]">Rounds</h1>

      <div className="mt-5 flex flex-wrap gap-2">
        <ActionForm action={A.autoFill} confirm="Fill every empty spot with the best free agents left (last season's fantasy points per game)?">
          <button className={`${btn} gold-btn`}>Auto fill</button>
        </ActionForm>
        <ActionForm action={A.restart} confirm="Restart free agency? Every bid and free agency signing is deleted. The player lists stay.">
          <button className={`${btn} border border-[var(--crimson)]/50 text-[var(--crimson)]`}>Restart</button>
        </ActionForm>
      </div>

      <form className="mt-6 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Find a free agent" className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 outline-none focus:border-[var(--gold)]/60" />
        <button className={`${btn} border border-white/15`}>Search</button>
      </form>
      {q && !results.length && <p className="mt-3 text-sm text-white/50">No free agent matches.</p>}
      {results.length > 0 && (
        <div className="mt-3 space-y-2">
          {results.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
              <div className="w-12 shrink-0"><PlayerCard p={p} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="text-xs text-white/45">{[p.position, p.nbaTeam, p.stats && `${p.stats.fppg} fpts`].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {rounds.map((r) => (
                  <ActionForm key={r.number} action={A.addToRound}>
                    <input type="hidden" name="round" value={r.number} />
                    <input type="hidden" name="player" value={p.id} />
                    <button disabled={!canAdd(r.number)} className="h-9 w-9 rounded-full border border-white/15 text-sm font-semibold hover:border-[var(--gold)] hover:text-[var(--gold)] disabled:opacity-25">
                      {r.number}
                    </button>
                  </ActionForm>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {rounds.map((r) => (
          <section key={r.number} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-3xl leading-none">Round {r.number}</h2>
              <span className={`text-xs tabular-nums ${r.players.length === PER_ROUND ? "text-[var(--gold)]" : "text-white/45"}`}>
                {r.status === "open" ? "Live · " : r.status === "final" ? "Done · " : ""}{r.players.length}/{PER_ROUND}
              </span>
            </div>
            {!r.players.length && <p className="mt-3 text-sm text-white/40">Empty</p>}
            <ul className="mt-3 space-y-1.5">
              {r.players.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <div className="w-8 shrink-0"><PlayerCard p={p} /></div>
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <span className="text-xs text-white/40">{p.stats ? `${p.stats.fppg}` : ""}</span>
                  {r.status === "setup" && (
                    <ActionForm action={A.removeFromRound}>
                      <input type="hidden" name="round" value={r.number} />
                      <input type="hidden" name="player" value={p.id} />
                      <button aria-label={`Remove ${p.name}`} className="grid h-7 w-7 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white">✕</button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Kicker className="mt-10">GMs · {teams.length}/{leagueSize}</Kicker>
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {teams.map((t) => (
          <div key={t.id} className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0">
            <TeamAvatar name={t.name} size="sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold">{t.name}</div>
              <div className="truncate text-xs text-white/45">{t.manager_name ?? ""} · {t.manager_email}</div>
            </div>
            <span className="text-xs text-white/50">{money(t.capSpace)}</span>
          </div>
        ))}
      </div>
      {teams.length < leagueSize && (
        <ActionForm action={A.addTeam} className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
          <input name="name" required maxLength={40} placeholder="Team name" className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none" />
          <input name="manager" placeholder="GM name" className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none" />
          <input name="email" type="email" required placeholder="Email" className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none" />
          <button className={`${btn} gold-btn`}>Add GM</button>
        </ActionForm>
      )}
    </div>
  );
}
