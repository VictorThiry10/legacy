import Link from "next/link";
import { db } from "@/lib/supabase/server";
import { getSettings, latestRound, requireTeam, resolve, roundPlayers, teamSummaries } from "@/lib/league";
import { canRenounce, money } from "@/lib/rules";
import AutoRefresh from "@/components/AutoRefresh";
import Countdown from "@/components/Countdown";
import ActionForm from "@/components/ActionForm";
import { placeBid, removeBid, renounce } from "./actions";

export const dynamic = "force-dynamic";

export default async function Draft() {
  const me = await requireTeam();
  const round = await latestRound();
  if (!round) {
    return (
      <div className="space-y-2">
        <AutoRefresh seconds={10} />
        <h1 className="text-2xl font-semibold">Draft</h1>
        <p className="card text-muted">No round is open yet. This page updates by itself.</p>
      </div>
    );
  }
  const closed = round.closes_at ? new Date(round.closes_at) < new Date() : false;
  return (
    <div className="space-y-4">
      <AutoRefresh seconds={round.status === "open" ? 5 : 10} />
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Round {round.number}</h1>
        {round.status === "open" && round.closes_at && (
          <span className="text-sm text-muted">Bids close in <Countdown until={round.closes_at} /></span>
        )}
        {round.status === "revealed" && <span className="text-sm text-accent">Results in. Winners can renounce until the commissioner finalizes.</span>}
        {round.status === "final" && <span className="text-sm text-muted">Final</span>}
      </div>
      {round.status === "open" ? <Bidding roundId={round.id} teamId={me.id} closed={closed} /> : <Results round={round} teamId={me.id} />}
    </div>
  );
}

async function Bidding({ roundId, teamId, closed }: { roundId: string; teamId: string; closed: boolean }) {
  const [players, { data: mine }, teams, { rules }] = await Promise.all([
    roundPlayers(roundId),
    db().from("bids").select("*").eq("round_id", roundId).eq("team_id", teamId),
    teamSummaries(),
    getSettings(),
  ]);
  const t = teams.find((x) => x.id === teamId)!;
  const open = rules.rosterMax - t.state.rosterCount;
  const committed = (mine ?? []).reduce((a, b) => a + Number(b.amount), 0);
  return (
    <>
      <div className="card text-sm flex flex-wrap gap-x-6 gap-y-1">
        <span>Cap space <b className="num">{money(t.capSpace)}</b></span>
        <span>Open spots <b className="num">{open}</b></span>
        <span>Your bids this round <b className="num">{money(committed)}</b></span>
        <span className="text-muted">Bids are secret until the round closes. You can change them until then.</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {players.map((p) => {
          const b = (mine ?? []).find((x) => x.player_id === p.id);
          return (
            <div key={p.id} className="card">
              <div className="flex items-center gap-3">
                {p.headshot && <img src={p.headshot} alt="" className="h-12 w-12 rounded-full object-cover bg-line" />}
                <div>
                  <Link href={`/players/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                  <div className="text-xs text-muted">
                    {p.nba_team} · {p.position}
                    {p.last_season?.gp ? <span> · {(p.last_season.fpts / p.last_season.gp).toFixed(1)} FP/G last season</span> : null}
                    {p.injury_status && <span className="text-bad"> · {p.injury_status}</span>}
                  </div>
                </div>
              </div>
              <ActionForm action={placeBid} className="mt-3 flex flex-wrap gap-2 items-end">
                <input type="hidden" name="round_id" value={roundId} />
                <input type="hidden" name="player_id" value={p.id} />
                <label className="flex-1 min-w-24">
                  <span className="label">Bid ($m)</span>
                  <input name="amount" type="number" step="0.1" min={rules.minSalary / 1e6} defaultValue={b ? Number(b.amount) / 1e6 : ""} className="input" required disabled={closed} />
                </label>
                <label>
                  <span className="label">Years</span>
                  <select name="years" defaultValue={b?.years ?? 1} className="input" disabled={closed}>
                    {[1, 2, 3, 4].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <button className="btn" disabled={closed}>{b ? "Update" : "Bid"}</button>
              </ActionForm>
              {b && !closed && (
                <ActionForm action={removeBid} className="mt-1">
                  <input type="hidden" name="round_id" value={roundId} />
                  <input type="hidden" name="player_id" value={p.id} />
                  <button className="text-xs text-muted hover:text-bad">Withdraw bid ({money(Number(b.amount))}, {b.years}yr)</button>
                </ActionForm>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

async function Results({ round, teamId }: { round: Awaited<ReturnType<typeof latestRound>> & {}; teamId: string }) {
  const { players, teams, bids, result, renounced } = await resolve(round);
  const { data: used } = await db().from("renounces").select("block").eq("team_id", teamId).eq("season", round.season);
  const renounceOk = round.status === "revealed" && canRenounce(round.number, (used ?? []).map((u) => u.block));
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? "?";
  const reason: Record<string, string> = { over_cap: "over the cap", roster_full: "roster full" };
  const voidedBy = new Map(result.voided.map((v) => [v.bidId, reason[v.reason] ?? v.reason.replace(/_/g, " ")]));
  return (
    <div className="space-y-3">
      {players.map((p) => {
        const award = result.awards.find((a) => a.playerId === p.id);
        const all = bids.filter((b) => b.playerId === p.id).sort((a, b) => b.amount - a.amount);
        return (
          <div key={p.id} className="card">
            <div className="flex flex-wrap items-baseline gap-2">
              <Link href={`/players/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
              <span className="text-xs text-muted">{p.nba_team} · {p.position}</span>
              <span className="ml-auto text-sm">
                {award ? (
                  <>
                    <b>{name(award.teamId)}</b> · {money(award.amount)} · {award.years}yr
                    {award.tie && <span className="text-accent"> · tie, settle by rock paper scissors</span>}
                  </>
                ) : (
                  <span className="text-muted">Unsold · back in the pool for the final round</span>
                )}
              </span>
            </div>
            {!!all.length && (
              <div className="mt-2 text-xs text-muted space-y-0.5">
                {all.map((b) => (
                  <div key={b.id} className={b.teamId === teamId ? "text-fg" : ""}>
                    {name(b.teamId)}: {money(b.amount)}, {b.years}yr
                    {renounced.has(b.id) && " · renounced"}
                    {voidedBy.has(b.id) && ` · void (${voidedBy.get(b.id)})`}
                  </div>
                ))}
              </div>
            )}
            {award && award.teamId === teamId && renounceOk && (
              <ActionForm action={renounce} className="mt-2" confirm="Use your Renounce Right for this block? The player goes to the next highest bidder.">
                <input type="hidden" name="round_id" value={round.id} />
                <input type="hidden" name="bid_id" value={award.bidId} />
                <button className="btn-ghost">Renounce</button>
              </ActionForm>
            )}
          </div>
        );
      })}
    </div>
  );
}
