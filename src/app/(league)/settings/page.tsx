import { getSettings } from "@/lib/league";
import { SCORING, type Scoring } from "@/lib/rules";
import ActionForm from "@/components/ActionForm";
import Field from "@/components/Field";
import { saveScoring, saveSettings, sendTestEmail } from "./actions";

export const dynamic = "force-dynamic";

const LABELS: Record<keyof Scoring, string> = {
  pts: "Point", fgm: "Field goal made", fgmi: "Field goal missed", reb: "Rebound", ast: "Assist", stl: "Steal",
  blk: "Block", to: "Turnover", tf: "Technical foul", ej: "Ejection", win: "Team win",
};

export default async function LeagueSettings() {
  const { season, leagueName, leagueSize, waiverHours, scoring, rules } = await getSettings();
  return (
    <div className="grid gap-6 lg:grid-cols-2 items-start">
      <section className="space-y-2">
        <h2 className="font-semibold">League</h2>
        <ActionForm action={saveSettings} className="card grid gap-4 sm:grid-cols-2">
          <Field label="League name" className="sm:col-span-2"><input name="league_name" defaultValue={leagueName} maxLength={40} required className="input" /></Field>
          <Field label="Season start year" note={`${season}–${String(season + 1).slice(2)} season`}><input name="season" type="number" defaultValue={season} required className="input" /></Field>
          <Field label="Teams in the league"><input name="league_size" type="number" min="2" max="20" defaultValue={leagueSize} required className="input" /></Field>
          <Field label="Hard cap ($m)"><input name="cap" type="number" step="0.1" min="0.1" defaultValue={rules.cap / 1e6} required className="input" /></Field>
          <Field label="Roster spots"><input name="roster_max" type="number" min="1" max="20" defaultValue={rules.rosterMax} required className="input" /></Field>
          <Field label="Min salary ($m)"><input name="min_salary" type="number" step="0.1" min="0.1" defaultValue={rules.minSalary / 1e6} required className="input" /></Field>
          <Field label="Waivers (hours)"><input name="waiver_hours" type="number" min="1" max="168" defaultValue={waiverHours} required className="input" /></Field>
          <div className="sm:col-span-2"><button className="btn">Save</button></div>
        </ActionForm>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Scoring</h2>
        <ActionForm action={saveScoring} className="card grid gap-3 grid-cols-2 sm:grid-cols-3" confirm="Save and recount every game and lineup with these points?">
          {(Object.keys(SCORING) as (keyof Scoring)[]).map((k) => (
            <Field key={k} label={LABELS[k]}><input name={k} type="number" step="0.5" defaultValue={scoring[k]} required className="input" /></Field>
          ))}
          <div className="col-span-full flex items-center gap-3">
            <button className="btn">Save</button>
          </div>
        </ActionForm>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Email</h2>
        <ActionForm action={sendTestEmail} className="card flex flex-wrap items-center gap-3">
          <button className="btn">Send test email</button>
        </ActionForm>
      </section>
    </div>
  );
}
