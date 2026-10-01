import { getSettings, teamSummaries } from "@/lib/league";
import { matchups, type Matchup } from "@/lib/season";
import { today, weekLabel } from "@/lib/dates";
import ActionForm from "@/components/ActionForm";
import Field from "@/components/Field";
import { buildSeason } from "../actions";

export const dynamic = "force-dynamic";

export default async function Schedule() {
  const [teams, ms, { leagueSize }] = await Promise.all([teamSummaries(), matchups(), getSettings()]);
  const name = (id: string | null) => (id ? teams.find((t) => t.id === id)?.name ?? "?" : "To be decided");
  const started = ms.some((m) => m.starts <= today());
  const full = teams.length === leagueSize;
  const group = (round: string) => {
    const rows = ms.filter((m) => m.round === round);
    return [...new Set(rows.map((m) => m.week))].map((w) => rows.filter((m) => m.week === w));
  };
  const Week = ({ games, seeds }: { games: Matchup[]; seeds?: string[] }) => (
    <div className="card text-sm">
      <div className="label mb-1">{weekLabel(games[0])}</div>
      {games.map((m, i) => (
        <div key={m.id}>{m.home_team_id ? `${name(m.home_team_id)} vs ${name(m.away_team_id)}` : seeds?.[i] ?? "To be decided"}</div>
      ))}
    </div>
  );
  return (
    <div className="space-y-6">
      <section className="space-y-2 max-w-xl">
        <h2 className="font-semibold">Build the schedule</h2>
        {started ? (
          <p className="card text-sm text-muted">Season started: schedule locked.</p>
        ) : !full ? (
          <p className="card text-sm text-muted">{teams.length} of {leagueSize} teams have joined.</p>
        ) : (
          <ActionForm action={buildSeason} className="card grid gap-4 sm:grid-cols-2 items-end" confirm={ms.length ? "Replace the current schedule?" : undefined}>
            <Field label="Opening night"><input name="first_day" type="date" required className="input" /></Field>
            <button className="btn">{ms.length ? "Rebuild" : "Build"}</button>
          </ActionForm>
        )}
      </section>
      {!!ms.length && (
        <>
          <section className="space-y-2">
            <h2 className="font-semibold">Regular season</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group("regular").map((games) => <Week key={games[0].week} games={games} />)}
            </div>
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">Playoffs</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group("semi").map((games) => <Week key="semi" games={games} seeds={["1st vs 4th", "2nd vs 3rd"]} />)}
              {group("final").map((games) => <Week key="final" games={games} seeds={["Semifinal winners"]} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
