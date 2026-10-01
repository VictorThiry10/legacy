import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { myTeamOrWelcome } from "@/lib/auth";
import { getSettings } from "@/lib/league";
import { rosters } from "@/lib/roster";
import { onIR } from "@/lib/lineup-store";
import { money } from "@/lib/rules";
import Slide, { BACK } from "@/components/Slide";
import { addPlayer } from "./actions";

export const dynamic = "force-dynamic";

// Confirm a free agent pickup: $min for 1 year; a full roster picks who to drop.
export default async function AddPlayer({ params, searchParams }: PageProps<"/players/[id]/add">) {
  const [{ id }, sp, me, { rules, season }] = await Promise.all([params, searchParams, myTeamOrWelcome(), getSettings()]);
  const [{ data: p }, { data: owned }, roster, ir] = await Promise.all([
    db().from("players").select("id, name, nba_team, position, headshot").eq("id", id).maybeSingle(),
    db().from("contracts").select("team:teams(name)").eq("player_id", id).eq("active", true).maybeSingle(),
    rosters([me.id]),
    onIR([me.id]),
  ]);
  if (!p) notFound();
  const full = roster.filter((r) => !ir.has(r.id)).length >= rules.rosterMax;
  const err = typeof sp.err === "string" ? sp.err : "";
  return (
    <Slide>
      <div className="mx-auto max-w-md space-y-4">
        <Link href={`/players/${p.id}`} transitionTypes={BACK} className="text-sm text-muted hover:text-fg">← {p.name}</Link>
        <div className="card flex items-center gap-4">
          {p.headshot ? <img src={p.headshot} alt="" className="h-16 w-16 rounded-full object-cover bg-line" /> : <span className="h-16 w-16 rounded-full bg-line" />}
          <div>
            <h1 className="text-xl font-semibold">Add {p.name}</h1>
            <p className="text-sm text-muted">{p.nba_team} · {p.position}</p>
            <p className="text-sm">{money(rules.minSalary)} · 1 year ({season}–{String(season + 1).slice(2)})</p>
          </div>
        </div>
        {err && <p className="card text-sm text-bad">{err}</p>}
        {owned ? (
          <p className="card text-sm">Already on {owned.team?.name ?? "another team"}.</p>
        ) : (
          <form action={addPlayer} className="space-y-3">
            <input type="hidden" name="player_id" value={p.id} />
            {full && (
              <div className="card space-y-2">
                <p className="text-sm font-medium">Your roster is full ({rules.rosterMax}). Pick a player to drop:</p>
                {roster.filter((r) => !ir.has(r.id)).map((r) => (
                  <label key={r.contract_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-line/50">
                    <input type="radio" name="drop" value={r.contract_id} required />
                    <span className="flex-1">{r.name} <span className="text-xs text-muted">{r.nba_team} · {r.position}</span></span>
                    <span className="num text-sm text-muted">{money(r.salary)}</span>
                  </label>
                ))}
              </div>
            )}
            <button className="btn w-full">{full ? "Drop and add" : `Add ${p.name}`}</button>
          </form>
        )}
      </div>
    </Slide>
  );
}
