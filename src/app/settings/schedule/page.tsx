import { teamSummaries } from "@/lib/league";
import { matchups } from "@/lib/season";
import { today, weekLabel } from "@/lib/dates";
import ActionForm from "@/components/ActionForm";
import Field from "@/components/Field";
import { buildSeason } from "../actions";

export const dynamic = "force-dynamic";

export default async function Schedule() {
  const [teams, ms] = await Promise.all([teamSummaries(), matchups()]);
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? "?";
  const started = ms.some((m) => m.starts <= today());
  const weeks = [...new Set(ms.map((m) => m.week))];
  return (
    <div className="space-y-6">
      <section className="space-y-2 max-w-xl">
        <h2 className="font-semibold">Build the schedule</h2>
        {started ? (
          <p className="card text-sm text-muted">The season has started, so the schedule is locked.</p>
        ) : (
          <ActionForm action={buildSeason} className="card grid gap-4 sm:grid-cols-3 items-end" confirm={ms.length ? "Replace the current schedule?" : undefined}>
            <Field label="First day" note="Opening night"><input name="first_day" type="date" required className="input" /></Field>
            <Field label="Weeks"><input name="weeks" type="number" min="1" max="30" defaultValue={20} required className="input" /></Field>
            <button className="btn">{ms.length ? "Rebuild" : "Build"}</button>
            <p className="sm:col-span-3 text-xs text-muted">
              Round robin between the {teams.length} teams signed up now: every team plays every other once, then it repeats.
              Week 1 runs from the first day to Sunday, then every week is Monday to Sunday. Rebuild after all teams join.
            </p>
          </ActionForm>
        )}
      </section>
      {!!weeks.length && (
        <section className="space-y-2">
          <h2 className="font-semibold">Schedule</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {weeks.map((w) => {
              const games = ms.filter((m) => m.week === w);
              return (
                <div key={w} className="card text-sm">
                  <div className="label mb-1">{weekLabel(games[0])}</div>
                  {games.map((m) => <div key={m.id}>{name(m.home_team_id)} vs {name(m.away_team_id)}</div>)}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
