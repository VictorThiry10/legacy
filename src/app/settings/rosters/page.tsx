import Link from "next/link";
import { db } from "@/lib/supabase/server";
import { getSettings, teamSummaries } from "@/lib/league";
import { recentMoves, rosters } from "@/lib/roster";
import { money } from "@/lib/rules";
import ActionForm from "@/components/ActionForm";
import Moves from "@/components/Moves";
import { makeTrade, release, sign } from "../actions";

export const dynamic = "force-dynamic";

export default async function Rosters({ searchParams }: PageProps<"/settings/rosters">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const [teams, { season, rules }, moves] = await Promise.all([teamSummaries(), getSettings(), recentMoves(30)]);
  const roster = await rosters(teams.map((t) => t.id));
  const q = str("q");
  const { data: found } = q
    ? await db().from("players").select("id, name, nba_team, position").ilike("name", `%${q}%`).order("rank", { nullsFirst: false }).limit(8)
    : { data: [] };
  const owner = new Map(roster.map((p) => [p.id, teams.find((t) => t.id === p.team_id)?.name]));
  const [a, b] = [str("a"), str("b")];
  const teamSelect = (name: string, value: string) => (
    <select name={name} defaultValue={value} className="input">{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
  );

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-semibold">Sign a player</h2>
        <form className="flex gap-2 max-w-md">
          <input name="q" defaultValue={q} placeholder="Find a player" className="input" />
          <button className="btn-ghost">Search</button>
        </form>
        {(found ?? []).map((p) => (
          <ActionForm key={p.id} action={sign} className="card flex flex-wrap gap-2 items-end text-sm">
            <input type="hidden" name="player_id" value={p.id} />
            <div className="w-44">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted">{p.nba_team} · {p.position}{owner.get(p.id) ? ` · on ${owner.get(p.id)}` : ""}</div>
            </div>
            <label><span className="label">Team</span>{teamSelect("team_id", teams[0]?.id ?? "")}</label>
            <label className="w-24"><span className="label">Salary $m</span><input name="salary" type="number" step="0.1" min="0.1" required className="input" /></label>
            <label className="w-20"><span className="label">Years</span><select name="years" className="input">{[1, 2, 3, 4].map((y) => <option key={y}>{y}</option>)}</select></label>
            <label><span className="label">Signed</span>
              <select name="season_signed" className="input" defaultValue={season}>
                <option value={season}>This season</option>
                <option value={season - 1}>Last season</option>
                <option value={season - 2}>2 seasons ago</option>
                <option value={season - 3}>3 seasons ago</option>
              </select>
            </label>
            <label><span className="label">How</span><select name="via" className="input"><option>manual</option><option>waiver</option><option>draft</option></select></label>
            <label className="flex-1 min-w-32"><span className="label">Note</span><input name="note" className="input" /></label>
            <label className="flex items-center gap-1 text-xs text-muted pb-2"><input type="checkbox" name="override" /> override</label>
            <button className="btn">Sign</button>
          </ActionForm>
        ))}
        {q && !found?.length && <p className="text-sm text-muted">No player matches “{q}”.</p>}
        <p className="text-xs text-muted">Signed in an earlier season keeps the contract&apos;s real end date and doesn&apos;t use this season&apos;s 2, 3 or 4 year slots.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Trade</h2>
        <form className="flex flex-wrap gap-2 items-end">
          <label><span className="label">Team A</span>{teamSelect("a", a)}</label>
          <label><span className="label">Team B</span>{teamSelect("b", b || teams[1]?.id || "")}</label>
          <button className="btn-ghost">Pick players</button>
        </form>
        {a && b && a !== b && (
          <ActionForm action={makeTrade} className="card space-y-3 text-sm">
            <input type="hidden" name="team_a" value={a} />
            <input type="hidden" name="team_b" value={b} />
            <div className="grid gap-4 sm:grid-cols-2">
              {[[a, "from_a"], [b, "from_b"]].map(([id, field]) => (
                <div key={id}>
                  <div className="label mb-1">{teams.find((t) => t.id === id)?.name} sends</div>
                  {roster.filter((p) => p.team_id === id).map((p) => (
                    <label key={p.contract_id} className="flex gap-2 py-0.5">
                      <input type="checkbox" name={field} value={p.contract_id} /> {p.name} <span className="text-muted">{money(p.salary)}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input name="note" placeholder="Note" className="input max-w-xs" />
              <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="override" /> override</label>
              <button className="btn">Make trade</button>
            </div>
          </ActionForm>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Rosters</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {teams.map((t) => (
            <div key={t.id} className="card text-sm space-y-1">
              <div className="flex items-baseline">
                <Link href={`/teams/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                <span className="ml-auto text-xs text-muted">{t.state.rosterCount}/{rules.rosterMax} · {money(t.state.salary)} · {money(t.capSpace)} space</span>
              </div>
              {roster.filter((p) => p.team_id === t.id).map((p) => (
                <ActionForm key={p.contract_id} action={release} className="flex gap-2 items-center" confirm={`Release ${p.name} from ${t.name}?`}>
                  <input type="hidden" name="contract_id" value={p.contract_id} />
                  <span className="flex-1">{p.name} <span className="text-xs text-muted">{money(p.salary)} · ends {p.season_signed + p.years - 1}–{String(p.season_signed + p.years).slice(2)}</span></span>
                  <button className="text-xs text-muted hover:text-bad">release</button>
                </ActionForm>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Recent moves</h2>
        <div className="card"><Moves moves={moves} /></div>
      </section>
    </div>
  );
}
