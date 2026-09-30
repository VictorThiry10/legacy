import { db } from "@/lib/supabase/server";
import { getSettings, requireCommish, roundPlayers, teamSummaries, type Round } from "@/lib/league";
import { money } from "@/lib/rules";
import ActionForm from "@/components/ActionForm";
import * as A from "./actions";

export const dynamic = "force-dynamic";

export default async function Commish({ searchParams }: PageProps<"/commish">) {
  await requireCommish();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const d = db();
  const [{ season, leagueName, rules }, teams, { data: rounds }, { count: playerCount }, { data: adjustments }] = await Promise.all([
    getSettings(),
    teamSummaries(),
    d.from("rounds").select("*").eq("season", (await getSettings()).season).order("number"),
    d.from("players").select("id", { count: "exact", head: true }),
    d.from("cap_adjustments").select("*, team:teams(name)").eq("active", true),
  ]);
  const setup = (rounds ?? []).find((r) => r.status === "setup") as Round | undefined;
  const live = (rounds ?? []).filter((r) => r.status === "open" || r.status === "revealed") as Round[];
  const setupPlayers = setup ? await roundPlayers(setup.id) : [];
  const { data: found } = q
    ? await d.from("players").select("id, name, nba_team, position").ilike("name", `%${q}%`).limit(10)
    : { data: [] as { id: string; name: string; nba_team: string; position: string }[] };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Commissioner</h1>

      <Section title="Draft rounds" note="Create a round, add its 8 players, open it for a few minutes, reveal, then finalize after any renounces.">
        <div className="flex flex-wrap gap-2">
          {(rounds ?? []).map((r) => (
            <span key={r.id} className="text-xs border border-line rounded-full px-2 py-1">R{r.number} · {r.status}</span>
          ))}
        </div>
        {live.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-2">
            <b>Round {r.number}</b> <span className="text-muted text-sm">{r.status}</span>
            {r.status === "open" && (
              <ActionForm action={A.reveal}><input type="hidden" name="round_id" value={r.id} /><button className="btn">Close and reveal</button></ActionForm>
            )}
            {r.status === "revealed" && (
              <ActionForm action={A.finalize} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="round_id" value={r.id} />
                <label className="text-xs flex items-center gap-1"><input type="checkbox" name="ties_ok" /> ties settled</label>
                <button className="btn">Finalize and sign players</button>
              </ActionForm>
            )}
            <ActionForm action={A.deleteRound} confirm="Delete this round and all its bids?"><input type="hidden" name="round_id" value={r.id} /><button className="text-xs text-muted hover:text-bad">Delete</button></ActionForm>
          </div>
        ))}
        {setup ? (
          <div className="card space-y-3">
            <div className="flex items-center gap-2"><b>Round {setup.number}</b><span className="text-muted text-sm">setting up · {setupPlayers.length} players</span></div>
            <ul className="text-sm space-y-1">
              {setupPlayers.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  {p.name} <span className="text-xs text-muted">{p.nba_team}</span>
                  <ActionForm action={A.removeFromRound}><input type="hidden" name="round_id" value={setup.id} /><input type="hidden" name="player_id" value={p.id} /><button className="text-xs text-muted hover:text-bad">remove</button></ActionForm>
                </li>
              ))}
            </ul>
            <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Find a player to add" className="input" /><button className="btn-ghost">Search</button></form>
            {(found ?? []).map((p) => (
              <ActionForm key={p.id} action={A.addToRound} className="flex items-center gap-2 text-sm">
                <input type="hidden" name="round_id" value={setup.id} /><input type="hidden" name="player_id" value={p.id} />
                <span>{p.name} <span className="text-xs text-muted">{p.nba_team} · {p.position}</span></span>
                <button className="btn-ghost py-1">Add</button>
              </ActionForm>
            ))}
            <ActionForm action={A.openRoundNow} className="flex items-end gap-2">
              <input type="hidden" name="round_id" value={setup.id} />
              <label><span className="label">Minutes</span><input name="minutes" type="number" defaultValue={5} className="input w-24" /></label>
              <button className="btn" disabled={!setupPlayers.length}>Open for bids</button>
            </ActionForm>
            <ActionForm action={A.deleteRound}><input type="hidden" name="round_id" value={setup.id} /><button className="text-xs text-muted hover:text-bad">Delete round</button></ActionForm>
          </div>
        ) : (
          <ActionForm action={A.newRound} className="flex flex-wrap items-center gap-3">
            <button className="btn">New round</button>
            <label className="text-sm flex items-center gap-1"><input type="checkbox" name="from_unsold" /> fill with unsold players (round 13)</label>
          </ActionForm>
        )}
      </Section>

      <Section title="Teams" note="Add each GM's email. They sign in with a link sent to that email.">
        <div className="space-y-2">
          {teams.map((t) => (
            <div key={t.id} className="flex flex-wrap items-end gap-2">
              <ActionForm action={A.updateTeam} className="flex flex-wrap gap-2 items-end">
                <input type="hidden" name="id" value={t.id} />
                <input name="name" defaultValue={t.name} className="input w-44" />
                <input name="manager_name" defaultValue={t.manager_name ?? ""} placeholder="GM name" className="input w-36" />
                <input name="manager_email" defaultValue={t.manager_email} className="input w-56" />
                <button className="btn-ghost">Save</button>
              </ActionForm>
              <span className="text-xs text-muted pb-2">{t.is_commish ? "commish · " : ""}{t.user_id ? "signed in" : "not signed in yet"}</span>
              {!t.is_commish && (
                <ActionForm action={A.removeTeam} confirm={`Remove ${t.name}? Their contracts are deleted too.`}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-muted hover:text-bad pb-2">remove</button></ActionForm>
              )}
            </div>
          ))}
        </div>
        <ActionForm action={A.addTeam} className="flex flex-wrap gap-2 items-end pt-2 border-t border-line">
          <input name="name" placeholder="Team name" required className="input w-44" />
          <input name="manager_name" placeholder="GM name" className="input w-36" />
          <input name="manager_email" type="email" placeholder="GM email" required className="input w-56" />
          <label className="text-xs flex items-center gap-1 pb-2"><input type="checkbox" name="is_commish" /> commish</label>
          <button className="btn">Add team</button>
        </ActionForm>
      </Section>

      <Section title="Players" note={`${playerCount ?? 0} players loaded. Data comes from ESPN; the scheduled job refreshes it automatically once live.`}>
        <div className="flex flex-wrap gap-3 items-end">
          <ActionForm action={A.loadPlayers}><button className="btn">Load players and injuries</button></ActionForm>
          <ActionForm action={A.loadSchedule}><button className="btn-ghost">Load season schedule</button></ActionForm>
          <ActionForm action={A.loadBoxScores} className="flex gap-2 items-end">
            <label><span className="label">Box scores for</span><input name="date" type="date" required className="input" /></label>
            <button className="btn-ghost">Load</button>
          </ActionForm>
        </div>
      </Section>

      <Section title="Rosters" note="Add or release a contract by hand (trades, waivers, fixes).">
        <ManualContract teams={teams.map((t) => ({ id: t.id, name: t.name }))} q={typeof sp.cq === "string" ? sp.cq : ""} />
        <RosterList />
      </Section>

      <Section title="Cap relief" note="Extra cap space, e.g. $1m while a player is listed Out.">
        <ActionForm action={A.addAdjustment} className="flex flex-wrap gap-2 items-end">
          <select name="team_id" className="input w-44">{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input name="extra" type="number" step="0.1" defaultValue={1} className="input w-24" />
          <input name="reason" placeholder="Reason (e.g. Embiid Out)" required className="input w-56" />
          <button className="btn">Add</button>
        </ActionForm>
        {(adjustments ?? []).map((a) => (
          <ActionForm key={a.id} action={A.endAdjustment} className="flex gap-2 items-center text-sm">
            <input type="hidden" name="id" value={a.id} />
            {a.team.name}: {money(-Number(a.amount))} · {a.reason}
            <button className="text-xs text-muted hover:text-bad">end</button>
          </ActionForm>
        ))}
      </Section>

      <Section title="Settings">
        <ActionForm action={A.saveSettings} className="flex flex-wrap gap-2 items-end">
          <label><span className="label">League</span><input name="league_name" defaultValue={leagueName} className="input w-44" /></label>
          <label><span className="label">Season start year</span><input name="season" type="number" defaultValue={season} className="input w-28" /></label>
          <label><span className="label">Cap ($m)</span><input name="cap" type="number" step="0.1" defaultValue={rules.cap / 1e6} className="input w-24" /></label>
          <label><span className="label">Roster spots</span><input name="roster_max" type="number" defaultValue={rules.rosterMax} className="input w-24" /></label>
          <label><span className="label">Min salary ($m)</span><input name="min_salary" type="number" step="0.1" defaultValue={rules.minSalary / 1e6} className="input w-24" /></label>
          <button className="btn">Save</button>
        </ActionForm>
      </Section>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

async function ManualContract({ teams, q }: { teams: { id: string; name: string }[]; q: string }) {
  const { data: found } = q
    ? await db().from("players").select("id, name, nba_team").ilike("name", `%${q}%`).limit(8)
    : { data: [] as { id: string; name: string; nba_team: string }[] };
  return (
    <div className="card space-y-2">
      <form className="flex gap-2"><input name="cq" defaultValue={q} placeholder="Find player" className="input" /><button className="btn-ghost">Search</button></form>
      {(found ?? []).map((p) => (
        <ActionForm key={p.id} action={A.addContract} className="flex flex-wrap gap-2 items-center text-sm">
          <input type="hidden" name="player_id" value={p.id} />
          <span className="w-40">{p.name} <span className="text-xs text-muted">{p.nba_team}</span></span>
          <select name="team_id" className="input w-40">{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input name="salary" type="number" step="0.1" placeholder="$m" required className="input w-20" />
          <select name="years" className="input w-20">{[1, 2, 3, 4].map((y) => <option key={y} value={y}>{y}yr</option>)}</select>
          <select name="via" className="input w-28"><option>manual</option><option>waiver</option><option>trade</option></select>
          <button className="btn-ghost">Add</button>
        </ActionForm>
      ))}
    </div>
  );
}

async function RosterList() {
  const { data } = await db().from("contracts").select("id, salary, years, team:teams(name), player:players(name)").eq("active", true).order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as unknown as { id: string; salary: number; years: number; team: { name: string }; player: { name: string } }[];
  if (!rows.length) return null;
  return (
    <details className="card text-sm">
      <summary className="cursor-pointer">All contracts ({rows.length})</summary>
      <div className="mt-2 space-y-1">
        {rows.map((c) => (
          <ActionForm key={c.id} action={A.releaseContract} className="flex gap-2 items-center" confirm={`Release ${c.player.name}?`}>
            <input type="hidden" name="id" value={c.id} />
            <span className="flex-1">{c.player.name} · {c.team.name} · {money(Number(c.salary))} · {c.years}yr</span>
            <button className="text-xs text-muted hover:text-bad">release</button>
          </ActionForm>
        ))}
      </div>
    </details>
  );
}
