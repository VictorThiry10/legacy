import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { playerOverview } from "@/lib/espn";
import type { Player } from "@/lib/league";
import { money } from "@/lib/rules";
import { seasonLabel } from "@/lib/player-stats";
import LocalTime from "@/components/LocalTime";

export const dynamic = "force-dynamic";

type Line = { label: string; gp: number; min: number; pts: number; reb: number; ast: number; stl: number; blk: number; to: number; fpts: number };

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const d = db();
  const [{ data: player }, { data: contract }, { data: logs }, overview] = await Promise.all([
    d.from("players").select("*").eq("id", id).maybeSingle(),
    d.from("contracts").select("salary, years, season_signed, team:teams(id, name)").eq("player_id", id).eq("active", true).maybeSingle(),
    d.from("player_games").select("*, game:games(start, home_team_id, away_team_id, home_score, away_score)").eq("player_id", id).eq("played", true),
    playerOverview(id),
  ]);
  if (!player) notFound();
  const p = player as Player & { injury_note: string | null };
  const c = contract as unknown as { salary: number; years: number; season_signed: number; team: { id: string; name: string } } | null;

  // This season so far, from our own box scores.
  type Log = { pts: number; reb: number; ast: number; stl: number; blk: number; tov: number; fpts: number; game: { start: string } };
  const games = ((logs ?? []) as unknown as Log[]).sort((a, b) => b.game.start.localeCompare(a.game.start));
  const lines: Line[] = [];
  const ls = p.last_season;
  if (ls?.gp) lines.push({ label: seasonLabel(ls.season), gp: ls.gp, min: ls.min, pts: ls.pts, reb: ls.reb, ast: ls.ast, stl: ls.stl, blk: ls.blk, to: ls.to, fpts: ls.fpts });
  if (games.length) {
    const sum = (k: keyof Omit<Log, "game">) => games.reduce((a, g) => a + Number(g[k]), 0);
    lines.unshift({ label: "This season", gp: games.length, min: 0, pts: sum("pts"), reb: sum("reb"), ast: sum("ast"), stl: sum("stl"), blk: sum("blk"), to: sum("tov"), fpts: sum("fpts") });
  }
  const [first, ...rest] = p.name.split(" ");

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/players" className="text-sm text-muted hover:text-fg">← Players</Link>

      <div className="card p-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          <div className="sm:w-56 bg-line/60 flex items-end justify-center pt-4 shrink-0">
            {p.headshot ? <img src={p.headshot} alt="" className="h-44 object-contain" /> : <div className="h-44" />}
          </div>
          <div className="flex-1 p-5 grid gap-5 sm:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <div>
                <div className="text-2xl leading-tight">{first}</div>
                <div className="text-2xl font-semibold leading-tight">{rest.join(" ")}</div>
                <div className="text-sm text-muted">{p.nba_team}</div>
              </div>
              <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
                <dt className="label self-center">Position</dt><dd>{p.position ?? "–"}</dd>
                <dt className="label self-center">Manager</dt>
                <dd>{c ? <Link href={`/teams/${c.team.id}`} className="hover:underline">{c.team.name}</Link> : "Free agent"}</dd>
                {c && (<><dt className="label self-center">Contract</dt><dd className="num">{money(Number(c.salary))} · {c.years}yr · ends {seasonLabel(c.season_signed + c.years)}</dd></>)}
                <dt className="label self-center">Status</dt>
                <dd className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${p.injury_status ? "bg-bad" : "bg-good"}`} />
                  {p.injury_status ?? "Healthy"}
                  {p.injury_note && <span className="text-muted text-xs">· {p.injury_note}</span>}
                </dd>
              </dl>
            </div>
            {overview && (overview.rank || overview.rostered) && (
              <dl className="sm:border-l border-line sm:pl-5 space-y-3 text-sm">
                <Stat label="ESPN rank" value={overview.rank ? `#${overview.rank}` : "–"} />
                <Stat label="Position rank" value={overview.positionRank ? `#${overview.positionRank}` : "–"} />
                <Stat label="% rostered (ESPN)" value={overview.rostered != null ? overview.rostered.toFixed(1) : "–"} />
              </dl>
            )}
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Stats</h2>
        {lines.length ? (
          <div className="overflow-x-auto">
            <table className="t whitespace-nowrap">
              <thead>
                <tr><th></th><th className="text-right">GP</th><th className="text-right">MIN</th><th className="text-right">PTS</th><th className="text-right">REB</th><th className="text-right">AST</th><th className="text-right">STL</th><th className="text-right">BLK</th><th className="text-right">TO</th><th className="text-right">FPTS</th><th className="text-right">FP/G</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const pg = (n: number) => (n / l.gp).toFixed(1);
                  return (
                    <tr key={l.label}>
                      <td className="text-muted">{l.label}</td>
                      <td className="num text-right">{l.gp}</td>
                      <td className="num text-right">{l.min ? pg(l.min) : "–"}</td>
                      <td className="num text-right">{pg(l.pts)}</td>
                      <td className="num text-right">{pg(l.reb)}</td>
                      <td className="num text-right">{pg(l.ast)}</td>
                      <td className="num text-right">{pg(l.stl)}</td>
                      <td className="num text-right">{pg(l.blk)}</td>
                      <td className="num text-right">{pg(l.to)}</td>
                      <td className="num text-right">{l.fpts.toFixed(1)}</td>
                      <td className="num text-right font-semibold">{pg(l.fpts)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No NBA games yet.</p>
        )}
        <p className="text-xs text-muted">Per game averages. Last season&apos;s fantasy points leave out the +1 win bonus.</p>
      </div>

      {overview?.note && (
        <div className="card space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">Latest news</h2>
            {overview.note.published && <span className="text-xs text-muted">{overview.note.published.replace(/ \d\d:\d\d:\d\d \w+ /, " ")}</span>}
          </div>
          <p className="font-medium">{overview.note.headline}</p>
          {overview.note.story && <p className="text-sm text-muted">{overview.note.story}</p>}
          <p className="text-xs text-muted">RotoWire via ESPN</p>
        </div>
      )}

      {overview?.outlook && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Outlook</h2>
          <p className="text-sm leading-relaxed">{overview.outlook}</p>
          <p className="text-xs text-muted">ESPN</p>
        </div>
      )}

      {!!overview?.news.length && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Headlines</h2>
          {overview.news.map((n, i) => (
            <div key={i} className="text-sm">
              <a href={n.url ?? "#"} target="_blank" rel="noreferrer" className="hover:underline">{n.headline}</a>
              {n.published && <span className="text-xs text-muted"> · <LocalTime iso={n.published} mode="date" /></span>}
            </div>
          ))}
        </div>
      )}

      {!!games.length && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Game log</h2>
          <table className="t whitespace-nowrap">
            <thead><tr><th>Date</th><th className="text-right">PTS</th><th className="text-right">REB</th><th className="text-right">AST</th><th className="text-right">STL</th><th className="text-right">BLK</th><th className="text-right">TO</th><th className="text-right">FPTS</th></tr></thead>
            <tbody>
              {games.slice(0, 15).map((g, i) => (
                <tr key={i}>
                  <td className="text-muted"><LocalTime iso={g.game.start} mode="day" /></td>
                  <td className="num text-right">{g.pts}</td><td className="num text-right">{g.reb}</td><td className="num text-right">{g.ast}</td>
                  <td className="num text-right">{g.stl}</td><td className="num text-right">{g.blk}</td><td className="num text-right">{g.tov}</td>
                  <td className="num text-right font-semibold">{Number(g.fpts).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!overview && <p className="text-xs text-muted">ESPN news didn&apos;t load this time. Refresh to try again.</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="text-xl font-semibold num">{value}</dd>
    </div>
  );
}
