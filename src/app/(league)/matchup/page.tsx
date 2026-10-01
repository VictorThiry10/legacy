import Link from "next/link";
import { myTeamOrWelcome } from "@/lib/auth";
import { teamSummaries, type TeamSummary } from "@/lib/league";
import { currentOf, matchups, scores, standings, type Matchup, type Standing } from "@/lib/season";
import { rosters, type RosterPlayer } from "@/lib/roster";
import { lineupsOn } from "@/lib/lineup-store";
import { SLOTS, isStarter, slotLabel, type LineupRow } from "@/lib/lineup";
import { gamesBetween, linesIn, teamAbbrs, type Game } from "@/lib/nba";
import { addDays, isDay, monthDay, today, weekday } from "@/lib/dates";
import { nbaLogo, shortName } from "@/lib/names";
import TeamAvatar from "@/components/TeamAvatar";
import { load } from "@/lib/guard";
import AutoRefresh from "@/components/AutoRefresh";
import Slide, { BACK, FORWARD } from "@/components/Slide";
import { GameStatus, oppLabel } from "@/components/GameInfo";
import MatchupSwipe from "@/components/MatchupSwipe";
import PickMenu from "@/components/PickMenu";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Head to head, ESPN style: swipe through the week's matchups at the top, the score stays pinned while you
// scroll, then one day at a time, slot by slot, one team on each side. My own team is always on the right.
export default async function MatchupPage({ searchParams }: PageProps<"/matchup">) {
  const [me, teams, sp, schedule] = await Promise.all([myTeamOrWelcome(), teamSummaries(), searchParams, load(() => matchups())]);
  const now = today();
  const r = await load(async () => {
    if ("err" in schedule) throw new Error(schedule.err);
    const all = schedule.ok;
    const mine = all.filter((x) => x.home_team_id === me.id || x.away_team_id === me.id);
    const picked = all.find((x) => x.id === sp.m);
    const week = picked?.week ?? (typeof sp.week === "string" ? Number(sp.week) : (currentOf(mine, now) ?? currentOf(all, now))?.week);
    const weekMs = all.filter((x) => x.week === week);
    const m = picked ?? weekMs.find((x) => x.home_team_id === me.id || x.away_team_id === me.id) ?? weekMs.find((x) => x.home_team_id) ?? weekMs[0];
    if (!m) return null;
    // left / right: my team on the right; otherwise away left, home right
    const [L, R] = m.home_team_id === me.id ? [m.away_team_id, m.home_team_id] : m.away_team_id === me.id ? [m.home_team_id, m.away_team_id] : [m.away_team_id, m.home_team_id];
    // Summary: the whole matchup, each player's points while in a starting slot (the lineup shown is today's).
    const summary = sp.d === "summary";
    const asked = !summary && typeof sp.d === "string" && isDay(sp.d) ? sp.d : now;
    const day = asked < m.starts ? m.starts : asked > m.ends ? m.ends : asked;
    const ids = [L, R].filter((x): x is string => !!x);
    const [s, table, roster, games, abbr, counted] = await Promise.all([
      scores(weekMs), standings(teams.map((t) => t.id)), rosters(ids), gamesBetween(day, day), teamAbbrs(),
      summary && ids.length
        ? db().from("lineup_points").select("team_id, player_id, slot, fpts").in("team_id", ids).gte("day", m.starts).lte("day", m.ends)
        : null,
    ]);
    const [lineups, lines] = await Promise.all([lineupsOn(ids, day, roster), linesIn(roster.map((p) => p.id), games.map((g) => g.id))]);
    const pts = new Map<string, number>();
    if (summary) {
      for (const c of counted?.data ?? []) if (isStarter(c.slot)) pts.set(c.player_id, (pts.get(c.player_id) ?? 0) + Number(c.fpts));
    } else {
      for (const l of lines) pts.set(l.playerId, (pts.get(l.playerId) ?? 0) + l.fpts);
    }
    const weeks = [...new Set(all.map((x) => x.week))];
    return { m, L, R, day, summary, s, table, roster, games, abbr, pts, lineups, weekMs, weeks };
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
  const { m, L, R, day, summary, s, table, roster, games, abbr, pts, lineups, weekMs, weeks } = r.ok;
  const team = (id: string | null) => (id ? teams.find((t) => t.id === id) : undefined);
  const scoreOf = (x: Matchup, id: string | null) => (id === x.home_team_id ? s.get(x.id)?.home : s.get(x.id)?.away) ?? 0;
  const live = m.starts <= now && now <= m.ends;
  const wi = weeks.indexOf(m.week);
  const href = (o: { week?: number; m?: string; d?: string }) =>
    `/matchup?${new URLSearchParams({ ...(o.m ? { m: o.m } : { week: String(o.week ?? m.week) }), ...(o.d ? { d: o.d } : {}) })}`;
  const players = new Map(roster.map((p) => [p.id, p]));
  const at = weekMs.findIndex((x) => x.id === m.id);
  const prevHref = at > 0 ? href({ m: weekMs[at - 1].id }) : undefined;
  const nextHref = at >= 0 && at < weekMs.length - 1 ? href({ m: weekMs[at + 1].id }) : undefined;
  const gameOf = (p?: RosterPlayer) => (p?.nba_team_id ? games.find((g) => g.home_team_id === p.nba_team_id || g.away_team_id === p.nba_team_id) : undefined);
  const nice = (d: string) => `${weekday(d).charAt(0)}${weekday(d).slice(1).toLowerCase()}, ${monthDay(d)}`;

  // Pair both lineups slot by slot; extra bench players go at the end of the bench.
  const left = (L && lineups.get(L)) || [], right = (R && lineups.get(R)) || [];
  const pairs: { slot: string; l?: LineupRow; r?: LineupRow }[] = SLOTS.map((slot) => ({ slot, l: left.find((x) => x.slot === slot), r: right.find((x) => x.slot === slot) }));
  const extraL = left.filter((x) => x.slot === "BE"), extraR = right.filter((x) => x.slot === "BE");
  for (let k = 0; k < Math.max(extraL.length, extraR.length); k++) pairs.splice(pairs.length - 1, 0, { slot: "BE", l: extraL[k], r: extraR[k] });
  const dayPts = (row?: LineupRow) => (row?.playerId ? pts.get(row.playerId) : undefined);
  const fmt = (n?: number) => (n == null ? "-" : String(Math.round(n * 10) / 10));
  const starters = pairs.filter((x) => isStarter(x.slot));
  const benchAndIR = pairs.filter((x) => !isStarter(x.slot));
  const dayTotal = (side: "l" | "r") => (summary ? scoreOf(m, side === "l" ? L : R) : starters.reduce((a, x) => a + (dayPts(x[side]) ?? 0), 0));
  const days: string[] = [];
  for (let d = m.starts; d <= m.ends; d = addDays(d, 1)) days.push(d);
  const dayMenu = [
    { label: "Summary", href: href({ m: m.id, d: "summary" }), on: summary },
    ...days.map((d) => ({ label: nice(d), href: href({ m: m.id, d }), on: !summary && d === day })),
  ];
  const row = ({ slot, l, r: rr }: { slot: string; l?: LineupRow; r?: LineupRow }, key: string) => {
    const pl = l?.playerId ? players.get(l.playerId) : undefined, pr = rr?.playerId ? players.get(rr.playerId) : undefined;
    return (
      <div key={key} className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.75rem_2.5rem_minmax(0,1fr)] border-b border-line/60 bg-card">
        <PlayerCell p={pl} g={summary ? undefined : gameOf(pl)} abbr={abbr} />
        <div className="flex items-center justify-end pr-2 text-sm num">{fmt(dayPts(l))}</div>
        <div className="flex items-center justify-center bg-line/70 text-[11px] font-bold text-muted">{slotLabel(slot) === "Bench" ? "BE" : slotLabel(slot) === "UTIL" ? "UTL" : slotLabel(slot)}</div>
        <div className="flex items-center pl-2 text-sm num">{fmt(dayPts(rr))}</div>
        <PlayerCell p={pr} g={summary ? undefined : gameOf(pr)} abbr={abbr} right />
      </div>
    );
  };

  return (
    <Slide>
      <div className="-mx-4 -mt-6 sm:mx-0 sm:mt-0">
        {live && <AutoRefresh seconds={60} />}

        {/* swipe through this week's matchups */}
        <div className="flex snap-x gap-2 overflow-x-auto bg-card px-3 pb-1 pt-2.5 [scrollbar-width:none]">
          <span className="flex shrink-0 snap-start items-center gap-1 rounded-full bg-line/70 px-2 text-xs font-semibold text-muted">
            {wi > 0 ? <Link href={href({ week: weeks[wi - 1] })} transitionTypes={BACK} className="px-1.5 py-2 text-base" aria-label="Previous week">‹</Link> : <span className="px-1.5 text-base opacity-30">‹</span>}
            {m.round === "semi" ? "Semis" : m.round === "final" ? "Final" : `Wk ${m.week}`}
            {wi < weeks.length - 1 ? <Link href={href({ week: weeks[wi + 1] })} transitionTypes={FORWARD} className="px-1.5 py-2 text-base" aria-label="Next week">›</Link> : <span className="px-1.5 text-base opacity-30">›</span>}
          </span>
          {weekMs.map((x) => {
            const [a, b] = [x.away_team_id, x.home_team_id];
            return (
              <Link
                key={x.id}
                href={href({ m: x.id })}
                prefetch={true}
                id={x.id === m.id ? "current-matchup" : undefined}
                transitionTypes={weekMs.indexOf(x) < weekMs.indexOf(m) ? BACK : FORWARD}
                className={`flex shrink-0 snap-start items-center gap-2 rounded-full px-3 py-1.5 text-sm ${x.id === m.id ? "border-2 border-fg" : "border-2 border-transparent bg-line/70"}`}
                aria-current={x.id === m.id ? "true" : undefined}
              >
                <TeamAvatar name={team(a)?.name} size="sm" />
                <span className="num font-semibold">{Math.round(scoreOf(x, a))}</span>
                <span className="text-xs text-muted">vs</span>
                <span className="num font-semibold">{Math.round(scoreOf(x, b))}</span>
                <TeamAvatar name={team(b)?.name} size="sm" />
              </Link>
            );
          })}
        </div>

        <MatchupSwipe prev={prevHref} next={nextHref}>
        {/* score, pinned under the tabs while scrolling */}
        <div className="sticky top-11 z-20 grid grid-cols-2 items-center bg-card px-4 py-3">
          <div className="flex items-center gap-3"><TeamAvatar name={team(L)?.name} size="lg" /><span className="num text-4xl font-black leading-none">{scoreOf(m, L).toFixed(1)}</span></div>
          <div className="flex items-center justify-end gap-3"><span className="num text-4xl font-black leading-none">{scoreOf(m, R).toFixed(1)}</span><TeamAvatar name={team(R)?.name} size="lg" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 bg-card px-4 pb-4">
          <TeamName t={team(L)} rec={table.find((x) => x.teamId === L)} />
          <TeamName t={team(R)} rec={table.find((x) => x.teamId === R)} right />
        </div>

        <div className="flex items-center border-y border-line bg-card">
          {!summary && day > m.starts
            ? <Link href={href({ m: m.id, d: addDays(day, -1) })} prefetch={true} transitionTypes={BACK} className="px-6 py-2.5 text-xl text-muted hover:text-fg" aria-label="Previous day">‹</Link>
            : <span className="px-6 py-2.5 text-xl text-line">‹</span>}
          <div className="flex-1 text-center"><PickMenu label={summary ? "Summary" : nice(day)} items={dayMenu} /></div>
          {!summary && day < m.ends
            ? <Link href={href({ m: m.id, d: addDays(day, 1) })} prefetch={true} transitionTypes={FORWARD} className="px-6 py-2.5 text-xl text-muted hover:text-fg" aria-label="Next day">›</Link>
            : <span className="px-6 py-2.5 text-xl text-line">›</span>}
        </div>

        <Slide key={`${m.id}-${summary ? "summary" : day}`}>
          <div className="bg-card">
            {starters.map((x, k) => row(x, `${x.slot}-${k}`))}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center border-y-4 border-bg bg-card px-4 py-3">
              <span className="num text-2xl font-bold">{dayTotal("l").toFixed(1)}</span>
              <span className="font-semibold">{summary ? "Total" : "Daily Total"}</span>
              <span className="num text-right text-2xl font-bold">{dayTotal("r").toFixed(1)}</span>
            </div>
            <div className="opacity-80">{benchAndIR.map((x, k) => row(x, `${x.slot}-b${k}`))}</div>
          </div>
        </Slide>
        </MatchupSwipe>
      </div>
    </Slide>
  );
}

function TeamName({ t, rec, right }: { t?: TeamSummary; rec?: Standing; right?: boolean }) {
  if (!t) return <div className={`text-sm text-muted ${right ? "text-right" : ""}`}>To be decided</div>;
  return (
    <Link href={`/teams/${t.id}`} className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className="truncate font-semibold">{t.name}</div>
      <div className="truncate text-xs text-muted">{t.manager_name ?? ""} · {rec ? `${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}` : "0-0"}</div>
    </Link>
  );
}

const INJ: Record<string, string> = { "day-to-day": "DTD", out: "O", questionable: "Q", doubtful: "D", suspension: "SSPD" };

function PlayerCell({ p, g, abbr, right }: { p?: RosterPlayer; g?: Game; abbr: Map<string, string>; right?: boolean }) {
  if (!p) return <div className={`flex items-center px-3 py-4 text-sm text-muted ${right ? "justify-end" : ""}`}>Empty</div>;
  const logo = nbaLogo(p.nba_team, 48);
  const inj = p.injury_status ? INJ[p.injury_status.toLowerCase()] ?? p.injury_status : null;
  return (
    <Link href={`/players/${p.id}`} prefetch={false} transitionTypes={FORWARD} className={`flex min-w-0 flex-col justify-center px-3 py-2.5 leading-tight active:bg-line/50 ${right ? "items-end text-right" : ""}`}>
      <span className={`flex min-w-0 max-w-full items-center gap-1.5 ${right ? "flex-row-reverse" : ""}`}>
        <span className="truncate text-[15px] font-medium">{shortName(p.name)}</span>
        {logo && <img src={logo} alt={p.nba_team ?? ""} className="h-4 w-4 shrink-0" />}
        {inj && <span className="shrink-0 text-[11px] font-bold text-bad">{inj}</span>}
      </span>
      {g && <span className="mt-0.5 truncate text-[11px] text-muted">{oppLabel(g, p.nba_team_id!, abbr)} <GameStatus g={g} teamId={p.nba_team_id!} /></span>}
    </Link>
  );
}
