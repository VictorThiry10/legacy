import Link from "next/link";
import { requireTeam, teamSummaries } from "@/lib/league";
import { currentOf, lineupFor, matchups, rosters, score, today, type RosterPlayer } from "@/lib/fantasy";
import { isStarter, slotLabel, weekLabel, type LineupRow } from "@/lib/lineup";
import { load } from "@/lib/guard";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

// My head to head for a week: both lineups side by side with points scored this week.
export default async function MatchupPage({ searchParams }: PageProps<"/matchup">) {
  const [me, teams, sp] = await Promise.all([requireTeam(), teamSummaries(), searchParams]);
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? "?";
  const now = today();
  const r = await load(async () => {
    const mine = await matchups(me.id);
    const m = mine.find((x) => String(x.week) === sp.week) ?? currentOf(mine, now);
    if (!m) return null;
    const ref = now < m.starts ? m.starts : now > m.ends ? m.ends : now; // lineup shown: today, clamped to the week
    const [s, roster] = await Promise.all([score([m]), rosters([m.home_team_id, m.away_team_id])]);
    const side = async (teamId: string) => {
      const players = roster.filter((p) => p.team_id === teamId);
      return { teamId, players, rows: await lineupFor(teamId, ref, players) };
    };
    const sides = await Promise.all([side(m.home_team_id), side(m.away_team_id)]);
    if (m.away_team_id === me.id) sides.reverse();
    return { m, s: s.get(m.id)!, sides, weeks: mine, ref };
  });

  if ("err" in r) return <p className="card text-bad text-sm">{r.err}</p>;
  if (!r.ok) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Matchup</h1>
        <p className="card text-muted">No matchups scheduled yet.</p>
      </div>
    );
  }
  const { m, s, sides, weeks, ref } = r.ok;
  const live = m.starts <= now && now <= m.ends;
  const total = (teamId: string) => (teamId === m.home_team_id ? s.home : s.away);
  const i = weeks.findIndex((w) => w.id === m.id);
  const [prev, next] = [weeks[i - 1], weeks[i + 1]];

  return (
    <div className="space-y-4">
      {live && <AutoRefresh seconds={60} />}
      <div className="flex items-center gap-2">
        {prev ? <Link href={`/matchup?week=${prev.week}`} className="btn-ghost px-2" aria-label="Previous week">‹</Link> : <span className="w-8" />}
        <div className="text-sm text-muted">{weekLabel(m)}{live ? " · live" : m.ends < now ? " · final" : " · upcoming"}</div>
        {next && <Link href={`/matchup?week=${next.week}`} className="btn-ghost px-2" aria-label="Next week">›</Link>}
      </div>

      <div className="card grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        {sides.map((x, k) => (
          <div key={x.teamId} className={`${k === 0 ? "order-1" : "order-3 text-right"}`}>
            <Link href={`/teams/${x.teamId}`} className="font-semibold hover:underline">{name(x.teamId)}</Link>
            <div className="num text-3xl font-semibold">{total(x.teamId)}</div>
          </div>
        ))}
        <span className="order-2 text-muted text-sm">vs</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sides.map((x) => <Side key={x.teamId} rows={x.rows} players={x.players} pts={(id) => s.byPlayer.get(`${x.teamId}:${id}`)} />)}
      </div>
      <p className="text-xs text-muted">Lineups as of {ref}. Week points count only days a player was in a starting slot.</p>
    </div>
  );
}

function Side({ rows, players, pts }: { rows: LineupRow[]; players: RosterPlayer[]; pts: (id: string) => number | undefined }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="t">
        <thead><tr><th>Slot</th><th>Player</th><th className="text-right">Week pts</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const p = r.playerId ? byId.get(r.playerId) : undefined;
            const v = r.playerId ? pts(r.playerId) : undefined;
            return (
              <tr key={`${r.slot}-${i}`} className={isStarter(r.slot) ? "" : "text-muted"}>
                <td className="text-muted">{slotLabel(r.slot)}</td>
                <td>
                  {p ? <><Link href={`/players/${p.id}`} className="hover:underline">{p.name}</Link> <span className="text-xs text-muted">{p.nba_team} · {p.position}</span>{p.injury_status && <span className="text-xs text-bad"> · {p.injury_status}</span>}</> : <span className="text-muted">Empty</span>}
                </td>
                <td className="num text-right">{v !== undefined ? Math.round(v * 10) / 10 : "--"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
