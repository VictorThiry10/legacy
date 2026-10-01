import Link from "next/link";
import { getMe } from "@/lib/auth";
import { getSettings, teamSummaries } from "@/lib/league";
import { standings } from "@/lib/season";
import { money } from "@/lib/rules";
import { recentMoves } from "@/lib/roster";
import Moves from "@/components/Moves";
import { load } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function League() {
  const [me, { rules, leagueName, season }, teams] = await Promise.all([getMe(), getSettings(), teamSummaries()]);
  const myId = me?.team?.id;
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? "?";
  const [table, moves] = await Promise.all([load(() => standings(teams.map((t) => t.id))), recentMoves(20)]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{leagueName}</h1>
        <p className="text-muted text-sm">{season}–{String(season + 1).slice(2)} season · {money(rules.cap)} hard cap · {rules.rosterMax} roster spots</p>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Standings</h2>
        <div className="card overflow-x-auto">
          {"err" in table ? (
            <p className="text-sm text-bad">{table.err}</p>
          ) : (
            <table className="t">
              <thead>
                <tr><th>#</th><th>Team</th><th className="text-right">W</th><th className="text-right">L</th><th className="text-right">T</th><th className="text-right">PF</th><th className="text-right">PA</th></tr>
              </thead>
              <tbody>
                {table.ok.map((r, i) => (
                  <tr key={r.teamId} className={r.teamId === myId ? "font-medium" : ""}>
                    <td className="text-muted num">{i + 1}</td>
                    <td><Link href={`/teams/${r.teamId}`} className="hover:underline">{name(r.teamId)}</Link></td>
                    <td className="num text-right">{r.w}</td>
                    <td className="num text-right">{r.l}</td>
                    <td className="num text-right">{r.t}</td>
                    <td className="num text-right">{Math.round(r.pf)}</td>
                    <td className="num text-right">{Math.round(r.pa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Cap sheet</h2>
        <div className="card overflow-x-auto">
          <table className="t">
            <thead>
              <tr><th>Team</th><th>Players</th><th className="text-right">Salary</th><th className="text-right">Cap space</th><th className="text-right hidden sm:table-cell">Max bid</th></tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const open = rules.rosterMax - t.state.rosterCount;
                const maxBid = open > 0 ? t.capSpace - (open - 1) * rules.minSalary : 0;
                return (
                  <tr key={t.id} className={t.id === myId ? "font-medium" : ""}>
                    <td><Link href={`/teams/${t.id}`} className="hover:underline">{t.name}</Link><div className="text-xs text-muted">{t.manager_name}</div></td>
                    <td className="num">{t.state.rosterCount}/{rules.rosterMax}</td>
                    <td className="num text-right">{money(t.state.salary)}</td>
                    <td className={`num text-right ${t.capSpace < 0 ? "text-bad" : ""}`}>{money(t.capSpace)}</td>
                    <td className="num text-right text-muted hidden sm:table-cell">{money(Math.max(0, maxBid))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Max bid keeps $1m for every other open roster spot, per league rules.</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Recent moves</h2>
        <div className="card"><Moves moves={moves} /></div>
      </section>
      <section className="flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
        {me?.team?.is_commish && <Link href="/settings" className="btn-ghost">Commissioner settings</Link>}
        <span className="text-muted">Signed in as {me?.email}</span>
        <form action="/auth/signout" method="post" className="ml-auto">
          <button className="btn-ghost">Sign out</button>
        </form>
      </section>
    </div>
  );
}
