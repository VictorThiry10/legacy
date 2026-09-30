import Link from "next/link";
import { getMe, getSettings, teamSummaries } from "@/lib/league";
import { money } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [me, { rules, leagueName, season }, teams] = await Promise.all([getMe(), getSettings(), teamSummaries()]);
  if (!me?.team) return <NotInLeague email={me?.email} />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{leagueName}</h1>
        <p className="text-muted text-sm">{season}–{String(season + 1).slice(2)} season · {money(rules.cap)} hard cap · {rules.rosterMax} roster spots</p>
      </div>
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
                <tr key={t.id} className={t.id === me.team!.id ? "font-medium" : ""}>
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
    </div>
  );
}

function NotInLeague({ email }: { email?: string }) {
  return <p className="card">{email} is not on a team yet. Ask the commissioner to add you.</p>;
}
