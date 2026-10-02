import Link from "next/link";
import { redirect } from "next/navigation";
import { bidTeam, commishVerified, PER_ROUND, searchFreeAgents, setupRounds } from "@/lib/bidding";
import { getSettings, teamSummaries } from "@/lib/league";
import { money } from "@/lib/rules";
import ActionForm from "@/components/ActionForm";
import PlayerCard from "@/components/bidding/PlayerCard";
import { Gm, Label } from "@/components/bidding/ui";
import * as A from "../actions";

export const dynamic = "force-dynamic";

// The round lengths the commissioner can pick (seconds, label). It applies from the next round that opens.
const ROUND_LENGTHS = [[30, "30 s"], [60, "1 min"], [120, "2 min"], [180, "3 min"], [300, "5 min"]] as const;

// Commissioner: which free agents go in which round, the GMs who can sign in, and a restart for test runs.
export default async function Setup({ searchParams }: PageProps<"/bidding/setup">) {
  const team = await bidTeam();
  if (!team || !(await commishVerified(team))) redirect("/bidding");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const [rounds, results, { leagueSize, roundSeconds }, teams] = await Promise.all([setupRounds(), searchFreeAgents(q), getSettings(), teamSummaries()]);
  const open = (n: number) => rounds.find((r) => r.number === n)!;
  const canAdd = (n: number) => open(n).status === "setup" && open(n).players.length < PER_ROUND;
  const btn = "rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-40";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Link href="/bidding" className="text-sm text-white/55 hover:text-white">← Room</Link>
      <h1 className="font-display mt-2 text-6xl leading-[0.85]">Rounds</h1>
      <p className="mt-3 max-w-md text-sm text-white/55">
        The free agents up for auction, {PER_ROUND} per round, in the order they come up. Search a free agent and tap a round number to
        add him, ✕ to take him out. Auto fill tops every round up with the best free agents left.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <ActionForm action={A.autoFill} confirm="Fill every empty spot with the best free agents left (last season's fantasy points per game)?">
          <button className={`${btn} btn-primary`}>Auto fill</button>
        </ActionForm>
        <ActionForm action={A.restart} confirm="Restart free agency? Every bid and free agency signing is deleted. The player lists stay.">
          <button className={`${btn} text-red-400 hover:bg-white/[0.05]`}>Restart</button>
        </ActionForm>
      </div>

      <Label className="mt-6">Bidding time per round</Label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ROUND_LENGTHS.map(([secs, label]) => (
          <ActionForm key={secs} action={A.setRoundSeconds}>
            <input type="hidden" name="seconds" value={secs} />
            <button className={`${btn} ${secs === roundSeconds ? "btn-primary" : "bg-white/[0.06] text-white/70 hover:text-white"}`}>{label}</button>
          </ActionForm>
        ))}
      </div>

      <form className="mt-6 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Find a free agent" className="h-12 min-w-0 flex-1 rounded-2xl bg-white/[0.06] px-4 outline-none ring-1 ring-inset ring-white/10 focus:ring-white/30" />
        <button className={`${btn} bg-white/[0.06]`}>Search</button>
      </form>
      {q && !results.length && <p className="mt-3 text-sm text-white/50">No free agent matches.</p>}
      {results.length > 0 && (
        <div className="mt-3 space-y-2">
          {results.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/[0.025] p-2.5">
              <div className="w-12 shrink-0"><PlayerCard p={p} size="thumb" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="text-xs text-white/45">{[p.position, p.nbaTeam, p.stats && `${p.stats.fppg} fpts`].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {rounds.map((r) => (
                  <ActionForm key={r.number} action={A.addToRound}>
                    <input type="hidden" name="round" value={r.number} />
                    <input type="hidden" name="player" value={p.id} />
                    <button disabled={!canAdd(r.number)} className="h-9 w-9 rounded-full bg-white/[0.06] text-sm font-semibold hover:bg-white hover:text-black disabled:opacity-20">
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
          <section key={r.number} className="rounded-2xl bg-white/[0.025] p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-3xl leading-none">Round {r.number}</h2>
              <span className={`text-xs tabular-nums ${r.players.length === PER_ROUND ? "text-white/80" : "text-white/40"}`}>
                {r.status === "open" ? "Live · " : r.status === "final" ? "Done · " : ""}{r.players.length}/{PER_ROUND}
              </span>
            </div>
            {!r.players.length && <p className="mt-3 text-sm text-white/40">Empty</p>}
            <ul className="mt-3 space-y-1.5">
              {r.players.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <div className="w-8 shrink-0"><PlayerCard p={p} size="thumb" /></div>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.name}
                    {r.signed.includes(p.id) && <span className="ml-2 text-xs text-[var(--bad)]">On a team · skipped</span>}
                  </span>
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

      <Label className="mt-10">GMs · {teams.length}/{leagueSize}</Label>
      <div className="mt-3 divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {teams.map((t) => (
          <div key={t.id} className="flex items-center gap-3 py-3">
            <Gm name={t.name} size="sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold">{t.name}</div>
              <div className="truncate text-xs text-white/45">{t.manager_name ?? ""} · {t.manager_email}</div>
            </div>
            <span className="text-xs text-white/50">{money(t.capSpace)}</span>
          </div>
        ))}
      </div>
      {teams.length < leagueSize && (
        <ActionForm action={A.addTeam} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
          <input name="name" required maxLength={40} placeholder="Team name" className="h-11 rounded-xl bg-white/[0.06] px-3 text-sm outline-none ring-1 ring-inset ring-white/10 focus:ring-white/30" />
          <input name="manager" placeholder="GM name" className="h-11 rounded-xl bg-white/[0.06] px-3 text-sm outline-none ring-1 ring-inset ring-white/10 focus:ring-white/30" />
          <input name="email" type="email" required placeholder="Email" className="h-11 rounded-xl bg-white/[0.06] px-3 text-sm outline-none ring-1 ring-inset ring-white/10 focus:ring-white/30" />
          <button className={`${btn} btn-primary`}>Add GM</button>
        </ActionForm>
      )}
    </div>
  );
}
