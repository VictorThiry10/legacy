import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { myTeamOrWelcome } from "@/lib/auth";
import { getSettings, teamSummaries } from "@/lib/league";
import { rosters } from "@/lib/roster";
import { onIR } from "@/lib/lineup-store";
import { lowestBid, waiverFor } from "@/lib/waivers";
import { money } from "@/lib/rules";
import Field from "@/components/Field";
import LocalTime from "@/components/LocalTime";
import Slide from "@/components/Slide";
import BackBar from "@/components/BackBar";
import { addPlayer, bid, unbid } from "./actions";
import { headshot } from "@/lib/names";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

// Add a player. A free agent: $min for 1 year, first come first served. A player on waivers: a sealed bid instead.
// Either way a full roster picks who to drop (for a bid, only if it wins).
export default async function AddPlayer({ params, searchParams }: PageProps<"/players/[id]/add">) {
  const [{ id }, sp, me, { rules, season, waiverHours }] = await Promise.all([params, searchParams, myTeamOrWelcome(), getSettings()]);
  const [{ data: p }, { data: owned }, roster, ir, onWaivers, summaries] = await Promise.all([
    db().from("players").select("id, name, nba_team, position, headshot").eq("id", id).maybeSingle(),
    db().from("contracts").select("team:teams(name)").eq("player_id", id).eq("active", true).maybeSingle(),
    rosters([me.id]),
    onIR([me.id]),
    waiverFor(id, me.id),
    teamSummaries(),
  ]);
  if (!p) notFound();
  const playing = roster.filter((r) => !ir.has(r.id));
  const full = playing.length >= rules.rosterMax;
  const err = typeof sp.err === "string" ? sp.err : "";
  const ok = typeof sp.ok === "string" ? sp.ok : "";
  const w = onWaivers?.waiver;
  const myBid = onWaivers?.myBid;
  const capSpace = summaries.find((t) => t.id === me.id)?.capSpace ?? 0;
  const years = `1 year (${season}–${String(season + 1).slice(2)})`;

  const dropPicker = (label: string, checked?: string | null) => (
    <div className="card space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {playing.map((r) => (
        <label key={r.contract_id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-line/50">
          <input type="radio" name="drop" value={r.contract_id} defaultChecked={r.contract_id === checked} required />
          <span className="flex-1">{r.name} <span className="text-xs text-muted">{r.nba_team} · {r.position}</span></span>
          <span className="num text-sm text-muted">{money(r.salary)}</span>
        </label>
      ))}
    </div>
  );

  return (
    <Slide>
      <div className="mx-auto max-w-md space-y-4">
        <BackBar href={`/players/${p.id}`} title={w && !owned ? "Bid on waivers" : "Add player"} />
        <div className="card flex items-center gap-4">
          {p.headshot ? <img src={headshot(p.headshot, 192)!} alt="" decoding="async" className="h-16 w-16 rounded-full object-cover bg-line" /> : <span className="h-16 w-16 rounded-full bg-line" />}
          <div>
            <h1 className="text-xl font-semibold">{w && !owned ? "Bid on" : "Add"} {p.name}</h1>
            <p className="text-sm text-muted">{p.nba_team} · {p.position}</p>
            {w && !owned ? (
              <p className="text-sm">
                <span className="rounded-full bg-orange px-2 py-0.5 text-xs font-semibold text-bg">On waivers</span>{" "}
                bids close <LocalTime iso={w.closes_at} mode="day" /> <LocalTime iso={w.closes_at} />
              </p>
            ) : (
              <p className="text-sm">{money(rules.minSalary)} · {years}</p>
            )}
          </div>
        </div>
        {err && <p className="card text-sm text-bad">{err}</p>}
        {ok && <p className="card text-sm text-good">{ok}</p>}
        {owned ? (
          <p className="card text-sm">Already on {owned.team?.name ?? "another team"}.</p>
        ) : w && w.dropped_by === me.id ? (
          <p className="card text-sm">You dropped him, so you can&apos;t bid on him until he clears waivers.</p>
        ) : w && new Date(w.closes_at) <= new Date() ? (
          <p className="card text-sm">Bidding has closed. He signs with the best bid as soon as it settles.</p>
        ) : w ? (
          <>
            <div className="card space-y-1 text-sm">
              <p>Every dropped player spends {waiverHours} hours on waivers. Bids are sealed: nobody sees yours. When bidding closes, the best bid signs him for {years} at that salary.</p>
              <p className="text-muted">Ties go to the team with more cap space, then the earlier bid. If nobody bids he becomes a free agent.</p>
            </div>
            {myBid && (
              <p className="card text-sm">
                Your bid: <b className="num">{money(Number(myBid.amount))}</b>
                {myBid.drop_contract && <> · drop {roster.find((r) => r.contract_id === myBid.drop_contract)?.name ?? "a player"} if you win</>}
              </p>
            )}
            <form action={bid} className="space-y-3">
              <input type="hidden" name="player_id" value={p.id} />
              <Field label="Your bid ($m)" note={`Whole millions, at least ${money(lowestBid(rules.minSalary))}. You have ${money(capSpace)} in cap space.`}>
                <input
                  name="amount" type="number" inputMode="numeric" step="1" min={lowestBid(rules.minSalary) / 1e6} required className="input"
                  defaultValue={(myBid ? Number(myBid.amount) : lowestBid(rules.minSalary)) / 1e6}
                />
              </Field>
              {full && dropPicker(`Your roster is full (${rules.rosterMax}). Pick a player to drop if you win:`, myBid?.drop_contract)}
              <SubmitButton className="btn w-full">{myBid ? "Change bid" : "Place bid"}</SubmitButton>
            </form>
            {myBid && (
              <form action={unbid}>
                <input type="hidden" name="player_id" value={p.id} />
                <SubmitButton className="btn-ghost w-full">Withdraw bid</SubmitButton>
              </form>
            )}
          </>
        ) : (
          <form action={addPlayer} className="space-y-3">
            <input type="hidden" name="player_id" value={p.id} />
            {full && dropPicker(`Your roster is full (${rules.rosterMax}). Pick a player to drop (he goes on waivers):`)}
            <SubmitButton className="btn w-full">{full ? "Drop and add" : `Add ${p.name}`}</SubmitButton>
          </form>
        )}
      </div>
    </Slide>
  );
}
