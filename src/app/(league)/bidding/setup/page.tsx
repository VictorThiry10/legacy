import { redirect } from "next/navigation";
import { bidTeam, commishVerified, PER_ROUND, REGULAR_ROUNDS, scheduleView, searchFreeAgents, setupRounds } from "@/lib/bidding";
import { getSettings, teamSummaries } from "@/lib/league";
import { money } from "@/lib/rules";
import ActionForm from "@/components/ActionForm";
import BackBar from "@/components/BackBar";
import Slide from "@/components/Slide";
import PlayerCard from "@/components/bidding/PlayerCard";
import Schedule from "@/components/bidding/Schedule";
import { Gm } from "@/components/bidding/ui";
import * as A from "../actions";

export const dynamic = "force-dynamic";

// Commissioner: which free agents go in which round, when the rounds open, the GMs who can sign in, and a restart for test runs.
export default async function Setup({ searchParams }: PageProps<"/bidding/setup">) {
  const team = await bidTeam();
  if (!team || !(await commishVerified(team))) redirect("/bidding");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const [rounds, results, { leagueSize }, teams, schedule] = await Promise.all([setupRounds(), searchFreeAgents(q), getSettings(), teamSummaries(), scheduleView()]);
  const open = (n: number) => rounds.find((r) => r.number === n)!;
  const canAdd = (n: number) => n <= REGULAR_ROUNDS && open(n).status === "setup" && open(n).players.length < PER_ROUND;

  return (
    <Slide>
      <div className="mx-auto max-w-5xl space-y-6">
        <BackBar
          href="/bidding"
          title="Rounds"
          right={
            <div className="flex gap-2">
              <ActionForm action={A.autoFill} confirm="Fill every empty spot with the best free agents left (last season's fantasy points per game)?">
                <button className="btn-ghost rounded-full">Auto fill</button>
              </ActionForm>
              <ActionForm action={A.restart} confirm="Restart free agency? Every bid and free agency signing is deleted, and the schedule is cleared. The player lists stay.">
                <button className="btn-ghost rounded-full text-bad">Restart</button>
              </ActionForm>
            </div>
          }
        />

        <Schedule {...schedule} />

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Players</h2>
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Find a free agent" className="input" />
            <button className="btn rounded-full px-5">Search</button>
          </form>
          {q && !results.length && <p className="text-sm text-muted">No free agent matches.</p>}
          {results.length > 0 && (
            <div className="divide-y divide-line rounded-xl border border-line bg-card">
              {results.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 p-2.5">
                  <div className="w-10 shrink-0"><PlayerCard p={p} size="thumb" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-xs text-muted">{[p.position, p.nbaTeam, p.stats && `${p.stats.fppg} fpts`].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {rounds.map((r) => (
                      <ActionForm key={r.number} action={A.addToRound}>
                        <input type="hidden" name="round" value={r.number} />
                        <input type="hidden" name="player" value={p.id} />
                        <button disabled={!canAdd(r.number)} className="h-8 w-8 rounded-full border border-line text-sm font-semibold hover:bg-fg hover:text-bg disabled:opacity-20">
                          {r.number}
                        </button>
                      </ActionForm>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {rounds.map((r) => (
              <div key={r.number} className="card">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold">Round {r.number}</h3>
                  <span className="text-xs tabular-nums text-muted">
                    {r.status === "open" ? "Live · " : r.status === "final" ? "Done · " : ""}{r.players.length}/{PER_ROUND}
                  </span>
                </div>
                {!r.players.length && <p className="mt-2 text-sm text-muted">Empty</p>}
                <ul className="mt-2 space-y-1.5">
                  {r.players.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <div className="w-7 shrink-0"><PlayerCard p={p} size="thumb" /></div>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {p.name}
                        {r.signed.includes(p.id) && <span className="ml-2 text-xs text-bad">On a team · skipped</span>}
                      </span>
                      <span className="text-xs tabular-nums text-muted">{p.stats ? `${p.stats.fppg}` : ""}</span>
                      {r.status === "setup" && (
                        <ActionForm action={A.removeFromRound}>
                          <input type="hidden" name="round" value={r.number} />
                          <input type="hidden" name="player" value={p.id} />
                          <button aria-label={`Remove ${p.name}`} className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-fg/[0.06] hover:text-fg">✕</button>
                        </ActionForm>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">GMs <span className="text-sm font-normal text-muted">{teams.length}/{leagueSize}</span></h2>
          <div className="divide-y divide-line rounded-xl border border-line bg-card">
            {teams.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <Gm team={{ name: t.name, logo_url: t.logo_url, color: t.color }} size="sm" />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-semibold">{t.name}</div>
                  <div className="truncate text-xs text-muted">{t.manager_name ?? ""} · {t.manager_email}</div>
                </div>
                <span className="text-xs tabular-nums text-muted">{money(t.capSpace)}</span>
              </div>
            ))}
          </div>
          {teams.length < leagueSize && (
            <ActionForm action={A.addTeam} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
              <input name="name" required maxLength={40} placeholder="Team name" className="input" />
              <input name="manager" placeholder="GM name" className="input" />
              <input name="email" type="email" required placeholder="Email" className="input" />
              <button className="btn rounded-full px-5">Add GM</button>
            </ActionForm>
          )}
        </section>
      </div>
    </Slide>
  );
}
