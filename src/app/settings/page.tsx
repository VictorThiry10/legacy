import { redirect } from "next/navigation";
import { getMe, getSettings, LEAGUE_SIZE } from "@/lib/league";
import ActionForm from "@/components/ActionForm";
import { saveSettings } from "./actions";

export const dynamic = "force-dynamic";

// League settings. Commissioner only.
export default async function Settings() {
  const [me, { season, leagueName, rules }] = await Promise.all([getMe(), getSettings()]);
  if (!me?.team?.is_commish) redirect("/");
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted text-sm">Only the commissioner sees this page.</p>
      </div>
      <ActionForm action={saveSettings} className="card grid gap-4 sm:grid-cols-2">
        <Field label="League name" className="sm:col-span-2"><input name="league_name" defaultValue={leagueName} maxLength={40} required className="input" /></Field>
        <Field label="Season start year" note={`${season}–${String(season + 1).slice(2)} season`}><input name="season" type="number" defaultValue={season} required className="input" /></Field>
        <Field label="Hard cap ($m)"><input name="cap" type="number" step="0.1" min="0.1" defaultValue={rules.cap / 1e6} required className="input" /></Field>
        <Field label="Roster spots"><input name="roster_max" type="number" min="1" max="20" defaultValue={rules.rosterMax} required className="input" /></Field>
        <Field label="Min salary ($m)"><input name="min_salary" type="number" step="0.1" min="0.1" defaultValue={rules.minSalary / 1e6} required className="input" /></Field>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button className="btn">Save</button>
          <span className="text-xs text-muted">League size is fixed at {LEAGUE_SIZE} teams.</span>
        </div>
      </ActionForm>
    </div>
  );
}

function Field({ label, note, className, children }: { label: string; note?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block space-y-1 ${className ?? ""}`}>
      <span className="label">{label}</span>
      {children}
      {note && <span className="block text-xs text-muted">{note}</span>}
    </label>
  );
}
