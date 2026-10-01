import Link from "next/link";
import { myTeamOrWelcome } from "@/lib/auth";
import { teamSummaries, type TeamSummary } from "@/lib/league";
import { currentOf, matchups, scores, standings } from "@/lib/season";
import { rosters, type RosterPlayer } from "@/lib/roster";
import { lineupsOn } from "@/lib/lineup-store";
import { SLOTS, isStarter, slotLabel, type LineupRow } from "@/lib/lineup";
import { boxLines, gamesBetween, teamAbbrs, type Game } from "@/lib/nba";
import { addDays, isDay, monthDay, today, weekday, weekLabel } from "@/lib/dates";
import { load } from "@/lib/guard";
import AutoRefresh from "@/components/AutoRefresh";
import Slide, { BACK, FORWARD } from "@/components/Slide";
import { GameStatus, oppLabel } from "@/components/GameInfo";

export const dynamic = "force-dynamic";

// My head to head (ESPN style): both scores up top, then one day at a time, slot by slot,
// their player on the left, mine on the right, with that day's points.
export default async function MatchupPage({ searchParams }: PageProps<"/matchup">) {
  const [me, teams, sp] = await Promise.all([myTeamOrWelcome(), teamSummaries(), searchParams]);
  const now = today();
  const r = await load(async () => {
    const mine = await matchups(me.id);
    const m = mine.find((x) => String(x.week) === sp.week) ?? currentOf(mine, now);
    if (!m) return null;
    const them = m.home_team_id === me.id ? m.away_team_id! : m.home_team_id!;
    const asked = typeof sp.d === "string" && isDay(sp.d) ? sp.d : now;
    const day = asked < m.starts ? m.starts : asked > m.ends ? m.ends : asked;
    const [s, table, roster, games, abbr] = await Promise.all([
      scores([m]), standings([them, me.id]), rosters([them, me.id]), gamesBetween(day, day), teamAbbrs(),
    ]);
    const [lineups, lines] = await Promise.all([lineupsOn([them, me.id], day, roster), boxLines(roster.map((p) => p.id))]);
    const pts = new Map<string, number>();
    for (const l of lines.filter((l) => l.day === day)) pts.set(l.playerId, (pts.get(l.playerId) ?? 0) + l.fpts);
    const score = s.get(m.id)!;
    const totals = new Map([[m.home_team_id!, score.home], [m.away_team_id!, score.away]]);
    return { m, day, them, roster, games, abbr, pts, lineups, totals, table, weeks: mine };
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
  const { m, day, them, roster, games, abbr, pts, lineups, totals, table, weeks } = r.ok;
  const team = (id: string) => teams.find((t) => t.id === id)!;
  const live = m.starts <= now && now <= m.ends;
  const i = weeks.findIndex((w) => w.id === m.id);
  const [prev, next] = [weeks[i - 1], weeks[i + 1]];
  const href = (o: { week?: number; d?: string }) => `/matchup?${new URLSearchParams({ week: String(o.week ?? m.week), ...(o.d ? { d: o.d } : {}) })}`;
  const players = new Map(roster.map((p) => [p.id, p]));
  const gameOf = (p?: RosterPlayer) => (p?.nba_team_id ? games.find((g) => g.home_team_id === p.nba_team_id || g.away_team_id === p.nba_team_id) : undefined);
  const nice = (d: string) => `${weekday(d).charAt(0)}${weekday(d).slice(1).toLowerCase()}, ${monthDay(d)}`;

  // Pair the two lineups slot by slot (any extra bench players go at the end of the bench).
  const left = lineups.get(them)!, right = lineups.get(me.id)!;
  const pairs: { slot: string; l?: LineupRow; r?: LineupRow }[] = SLOTS.map((slot) => ({ slot, l: left.find((x) => x.slot === slot), r: right.find((x) => x.slot === slot) }));
  const extraL = left.filter((x) => x.slot === "BE"), extraR = right.filter((x) => x.slot === "BE");
  for (let k = 0; k < Math.max(extraL.length, extraR.length); k++) pairs.splice(pairs.length - 1, 0, { slot: "BE", l: extraL[k], r: extraR[k] });
  const val = (row?: LineupRow) => (row?.playerId && pts.has(row.playerId) ? String(Math.round(pts.get(row.playerId)! * 10) / 10) : "-");
  const cell = (row: LineupRow | undefined, alignRight: boolean) => {
    const p = row?.playerId ? players.get(row.playerId) : undefined;
    return <PlayerCell p={p} g={gameOf(p)} abbr={abbr} right={alignRight} />;
  };

  return (
    <Slide>
      <div>
        {live && <AutoRefresh seconds={60} />}
        <div className="-mx-4 flex items-center justify-center gap-3 border-b border-line bg-card px-4 py-2 text-xs text-muted sm:mx-0">
          {prev ? <Link href={href({ week: prev.week })} transitionTypes={BACK} className="px-2 text-base hover:text-fg" aria-label="Previous week">‹</Link> : <span className="w-6" />}
          <span>{weekLabel(m)}{live ? " · live" : m.ends < now ? " · final" : ""}</span>
          {next ? <Link href={href({ week: next.week })} transitionTypes={FORWARD} className="px-2 text-base hover:text-fg" aria-label="Next week">›</Link> : <span className="w-6" />}
        </div>

        <div className="-mx-4 grid grid-cols-2 gap-4 border-b border-line bg-card px-4 py-4 sm:mx-0">
          {[them, me.id].map((id, k) => (
            <TeamHead key={id} t={team(id)} pts={totals.get(id) ?? 0} rec={table.find((t) => t.teamId === id)} right={k === 1} />
          ))}
        </div>

        {now < m.starts && (
          <p className="-mx-4 border-b border-line bg-line/40 px-4 py-3 text-center text-sm sm:mx-0">
            This matchup starts {nice(m.starts)}. Check back then to follow it live.
          </p>
        )}

        <div className="-mx-4 flex items-center border-b border-line bg-card sm:mx-0">
          {day > m.starts
            ? <Link href={href({ d: addDays(day, -1) })} transitionTypes={BACK} className="px-4 py-2 text-xl text-muted hover:text-fg" aria-label="Previous day">‹</Link>
            : <span className="px-4 py-2 text-xl text-line">‹</span>}
          <div className="flex-1 text-center font-semibold text-accent">{nice(day)}</div>
          {day < m.ends
            ? <Link href={href({ d: addDays(day, 1) })} transitionTypes={FORWARD} className="px-4 py-2 text-xl text-muted hover:text-fg" aria-label="Next day">›</Link>
            : <span className="px-4 py-2 text-xl text-line">›</span>}
        </div>

        <Slide key={day}>
          <div className="-mx-4 bg-card sm:mx-0">
            {pairs.map(({ slot, l, r: rr }, k) => {
              const bench = !isStarter(slot);
              const firstBench = bench && (k === 0 || isStarter(pairs[k - 1].slot));
              const label = slotLabel(slot) === "Bench" ? "BE" : slotLabel(slot);
              return (
                <div key={`${slot}-${k}`} className={`grid grid-cols-[1fr_auto_2.75rem_auto_1fr] items-stretch border-b border-line ${firstBench ? "border-t-4 border-t-line" : ""} ${bench ? "opacity-70" : ""}`}>
                  {cell(l, false)}
                  <div className="flex items-center px-2 text-sm num">{val(l)}</div>
                  <div className="flex items-center justify-center bg-line/60 text-[11px] font-bold text-muted">{label}</div>
                  <div className="flex items-center px-2 text-sm num">{val(rr)}</div>
                  {cell(rr, true)}
                </div>
              );
            })}
          </div>
        </Slide>
      </div>
    </Slide>
  );
}

function TeamHead({ t, pts, rec, right }: { t: TeamSummary; pts: number; rec?: { w: number; l: number; t: number }; right: boolean }) {
  return (
    <Link href={`/teams/${t.id}`} className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className="num text-4xl font-black leading-none">{pts.toFixed(1)}</div>
      <div className="mt-2 truncate font-semibold">{t.name}</div>
      <div className="truncate text-xs text-muted">{t.manager_name ?? ""} · {rec ? `${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}` : "0-0"}</div>
    </Link>
  );
}

// "Shai Gilgeous-Alexander" -> "S. Gilgeous-Alexander"
const short = (name: string) => {
  const [first, ...rest] = name.split(" ");
  return rest.length ? `${first[0]}. ${rest.join(" ")}` : name;
};

function PlayerCell({ p, g, abbr, right }: { p?: RosterPlayer; g?: Game; abbr: Map<string, string>; right: boolean }) {
  if (!p) return <div className={`flex items-center px-3 py-3 text-sm text-muted ${right ? "justify-end" : ""}`}>Empty</div>;
  return (
    <Link href={`/players/${p.id}`} className={`min-w-0 px-3 py-2 leading-tight ${right ? "text-right" : ""}`}>
      <div className="truncate text-sm font-medium">
        {short(p.name)} <span className="text-[10px] font-semibold text-muted">{p.nba_team}</span>
        {p.injury_status && <span className="text-[10px] font-semibold uppercase text-bad"> {p.injury_status}</span>}
      </div>
      <div className="truncate text-[11px] text-muted">
        {g ? <>{oppLabel(g, p.nba_team_id!, abbr)} <GameStatus g={g} teamId={p.nba_team_id!} /></> : "No game"}
      </div>
    </Link>
  );
}
