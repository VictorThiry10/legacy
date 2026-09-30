import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { getSettings, teamSummaries } from "@/lib/league";
import { money } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  const [{ season, rules }, teams] = await Promise.all([getSettings(), teamSummaries()]);
  const team = teams.find((t) => t.id === id);
  if (!team) notFound();
  const d = db();
  const [{ data: contracts }, { data: adj }] = await Promise.all([
    d.from("contracts").select("*, player:players(*)").eq("team_id", id).eq("active", true).order("salary", { ascending: false }),
    d.from("cap_adjustments").select("*").eq("team_id", id).eq("active", true),
  ]);
  const slots = [4, 3, 2].map((y) => `${rules.slotLimits[y] - (team.state.slotsUsed[y] ?? 0)} of ${rules.slotLimits[y]} × ${y}yr`);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{team.name}</h1>
        <p className="text-muted text-sm">{team.manager_name ?? team.manager_email}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Salary" value={money(team.state.salary)} />
        <Stat label="Cap space" value={money(team.capSpace)} bad={team.capSpace < 0} />
        <Stat label="Roster" value={`${team.state.rosterCount}/${rules.rosterMax}`} />
        <Stat label="Contract slots left" value={slots.join(" · ")} small />
      </div>
      <div className="card overflow-x-auto">
        <table className="t">
          <thead><tr><th>Player</th><th>Pos</th><th className="text-right">Salary</th><th className="text-right">Contract</th></tr></thead>
          <tbody>
            {(contracts ?? []).map((c) => {
              const ends = c.season_signed + c.years - 1;
              return (
                <tr key={c.id}>
                  <td>
                    {c.player.name} <span className="text-xs text-muted">{c.player.nba_team}</span>
                    {c.player.injury_status && <span className="ml-2 text-xs text-bad">{c.player.injury_status}</span>}
                  </td>
                  <td>{c.player.position}</td>
                  <td className="num text-right">{money(Number(c.salary))}</td>
                  <td className="num text-right">{c.years}yr · ends {ends}–{String(ends + 1).slice(2)}{ends === season ? " · expiring" : ""}</td>
                </tr>
              );
            })}
            {!contracts?.length && <tr><td colSpan={4} className="text-muted">No players yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {!!adj?.length && (
        <div className="card text-sm">
          <div className="label mb-2">Cap adjustments</div>
          {adj.map((a) => <div key={a.id}>{money(-Number(a.amount))} extra space · {a.reason}</div>)}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bad, small }: { label: string; value: string; bad?: boolean; small?: boolean }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`${small ? "text-xs mt-1" : "text-xl"} font-semibold num ${bad ? "text-bad" : ""}`}>{value}</div>
    </div>
  );
}
