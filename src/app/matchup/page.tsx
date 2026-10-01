import Link from "next/link";
import { myTeamOrWelcome } from "@/lib/auth";
import { teamSummaries, type TeamSummary } from "@/lib/league";
import { currentOf, matchups, scores, standings, type Matchup, type Standing } from "@/lib/season";
import { rosters, type RosterPlayer } from "@/lib/roster";
import { lineupsOn } from "@/lib/lineup-store";
import { SLOTS, isStarter, slotLabel, type LineupRow } from "@/lib/lineup";
import { boxLines, gamesBetween, teamAbbrs, type Game } from "@/lib/nba";
import { addDays, isDay, monthDay, today, weekday } from "@/lib/dates";
import { initials, nbaLogo, shortName } from "@/lib/names";
import { load } from "@/lib/guard";
import AutoRefresh from "@/components/AutoRefresh";
import Slide, { BACK, FORWARD } from "@/components/Slide";
import { GameStatus, oppLabel } from "@/components/GameInfo";

export const dynamic = "force-dynamic";

// Head to head, ESPN style: swipe through the week's matchups at the top, the score stays pinned while you
// scroll, then one day at a time, slot by slot, one team on each side. My own team is always on the right.
export default async function MatchupPage({ searchParams }: PageProps<"/matchup">) {
  const [me, teams, sp] = await Promise.all([myTeamOrWelcome(), teamSummaries(), searchParams]);
  const now = today();
  const r = await load(async () => {
    const all = await matchups();
    const mine = all.filter((x) => x.home_team_id === me.id || x.away_team_id === me.id);
    const picked = all.find((x) => x.id === sp.m);
    const week = picked?.week ?? (typeof sp.week === "string" ? Number(sp.week) : (currentOf(mine, now) ?? currentOf(all, now))?.week);
    const weekMs = all.filter((x) => x.week === week);
    const m = picked ?? weekMs.find((x) => x.home_team_id === me.id || x.away_team_id === me.id) ?? weekMs.find((x) => x.home_team_id) ?? weekMs[0];
    if (!m) return null;
    // left / right: my team on the right; otherwise away left, home right
    const [L, R] = m.home_team_id === me.id ? [m.away_team_id, m.home_team_id] : m.away_team_id === me.id ? [m.home_team_id, m.away_team_id] : [m.away_team_id, m.home_team_id];
    const asked = typeof sp.d === "string" && isDay(sp.d) ? sp.d : now;
    const day = asked < m.starts ? m.starts : asked > m.ends ? m.ends : asked;
    const ids = [L, R].filter((x): x is string => !!x);
    const [s, table, roster, games, abbr] = await Promise.all([
      scores(weekMs), standings(teams.map((t) => t.id)), rosters(ids), gamesBetween(day, day), teamAbbrs(),
    ]);
    const [lineups, lines] = await Promise.all([lineupsOn(ids, day, roster), boxLines(roster.map((p) => p.id))]);
    const pts = new Map<string, number>();
    for (const l of lines.filter((l) => l.day === day)) pts.set(l.playerId, (pts.get(l.playerId) ?? 0) + l.fpts);
    const weeks = [...new Set(all.map((x) => x.week))];
    return { m, L, R, day, s, table, roster, games, abbr, pts, lineups, weekMs, weeks };
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
  const { m, L, R, day, s, table, roster, games, abbr, pts, lineups, weekMs, weeks } = r.ok;
  const team = (id: string | null) => (id ? teams.find((t) => t.id === id) : undefined);
  const scoreOf = (x: Matchup, id: string | null) => (id === x.home_team_id ? s.get(x.id)?.home : s.get(x.id)?.away) ?? 0;
  const live = m.starts <= now && now <= m.ends;
  const wi = weeks.indexOf(m.week);
  const href = (o: { week?: number; m?: string; d?: string }) =>
    `/matchup?${new URLSearchParams({ ...(o.m ? { m: o.m } : { week: String(o.week ?? m.week) }), ...(o.d ? { d: o.d } : {}) })}`;
  const players = new Map(roster.map((p) => [p.id, p]));
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
  const dayTotal = (side: "l" | "r") => starters.reduce((a, x) => a + (dayPts(x[side]) ?? 0), 0);
  const row = ({ slot, l, r: rr }: { slot: string; l?: LineupRow; r?: LineupRow }, key: string) => {
    const pl = l?.playerId ? players.get(l.playerId) : undefined, pr = rr?.playerId ? players.get(rr.playerId) : undefined;
    return (
      <div key={key} className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.75rem_2.5rem_minmax(0,1fr)] border-b-4 border-bg bg-card">
        <PlayerCell p={pl} g={gameOf(pl)} abbr={abbr} />
        <div className="flex items-center justify-end pr-2 text-sm num">{fmt(dayPts(l))}</div>
        <div className="flex items-center justify-center bg-line/70 text-[11px] font-bold text-muted">{slotLabel(slot) === "Bench" ? "BE" : slotLabel(slot) === "UTIL" ? "UTL" : slotLabel(slot)}</div>
        <div className="flex items-center pl-2 text-sm num">{fmt(dayPts(rr))}</div>
        <PlayerCell p={pr} g={gameOf(pr)} abbr={abbr} right />
      </div>
    );
  };

  return (
    <Slide>
      <div className="-mx-4 -mt-6 sm:mx-0 sm:mt-0">
        {live && <AutoRefresh seconds={60} />}

        {/* swipe through this week's matchups */}
        <div className="flex snap-x gap-2 overflow-x-auto border-b border-line bg-card px-3 py-2.5 [scrollbar-width:none]">
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
                transitionTypes={FORWARD}
                className={`flex shrink-0 snap-start items-center gap-2 rounded-full px-3 py-1.5 text-sm ${x.id === m.id ? "border-2 border-fg" : "border-2 border-transparent bg-line/70"}`}
                aria-current={x.id === m.id ? "true" : undefined}
              >
                <Avatar t={team(a)} size="sm" />
                <span className="num font-semibold">{Math.round(scoreOf(x, a))}</span>
                <span className="text-xs text-muted">vs</span>
                <span className="num font-semibold">{Math.round(scoreOf(x, b))}</span>
                <Avatar t={team(b)} size="sm" />
              </Link>
            );
          })}
        </div>

        {/* score, pinned under the tabs while scrolling */}
        <div className="sticky top-11 z-20 grid grid-cols-2 items-center bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-3"><Avatar t={team(L)} /><span className="num text-4xl font-black leading-none">{scoreOf(m, L).toFixed(1)}</span></div>
          <div className="flex items-center justify-end gap-3"><span className="num text-4xl font-black leading-none">{scoreOf(m, R).toFixed(1)}</span><Avatar t={team(R)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 border-b border-line bg-card px-4 pb-3">
          <TeamName t={team(L)} rec={table.find((x) => x.teamId === L)} />
          <TeamName t={team(R)} rec={table.find((x) => x.teamId === R)} right />
        </div>

        <div className="flex items-center border-b border-line bg-card">
          {day > m.starts
            ? <Link href={href({ m: m.id, d: addDays(day, -1) })} transitionTypes={BACK} className="px-6 py-2.5 text-xl text-muted hover:text-fg" aria-label="Previous day">‹</Link>
            : <span className="px-6 py-2.5 text-xl text-line">‹</span>}
          <div className="flex-1 text-center font-semibold text-accent">{nice(day)}</div>
          {day < m.ends
            ? <Link href={href({ m: m.id, d: addDays(day, 1) })} transitionTypes={FORWARD} className="px-6 py-2.5 text-xl text-muted hover:text-fg" aria-label="Next day">›</Link>
            : <span className="px-6 py-2.5 text-xl text-line">›</span>}
        </div>

        <Slide key={`${m.id}-${day}`}>
          <div className="bg-bg pt-1">
            {starters.map((x, k) => row(x, `${x.slot}-${k}`))}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b-4 border-bg bg-card px-4 py-3">
              <span className="num text-2xl font-bold">{dayTotal("l").toFixed(1)}</span>
              <span className="font-semibold">Daily Total</span>
              <span className="num text-right text-2xl font-bold">{dayTotal("r").toFixed(1)}</span>
            </div>
            <div className="opacity-80">{benchAndIR.map((x, k) => row(x, `${x.slot}-b${k}`))}</div>
          </div>
        </Slide>
      </div>
    </Slide>
  );
}

// A fantasy team's badge: initials on a colour picked from its name.
function Avatar({ t, size = "lg" }: { t?: TeamSummary; size?: "sm" | "lg" }) {
  const hue = [...(t?.name ?? "?")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const box = size === "sm" ? "h-7 w-7 text-[9px]" : "h-12 w-12 text-sm";
  return (
    <span className={`${box} inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white`} style={{ background: t ? `hsl(${hue} 55% 42%)` : "var(--line)" }}>
      {t ? initials(t.name) : "?"}
    </span>
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
  const logo = nbaLogo(p.nba_team);
  const inj = p.injury_status ? INJ[p.injury_status.toLowerCase()] ?? p.injury_status : null;
  return (
    <Link href={`/players/${p.id}`} className={`flex min-w-0 flex-col justify-center px-3 py-2.5 leading-tight ${right ? "items-end text-right" : ""}`}>
      <span className={`flex min-w-0 max-w-full items-center gap-1.5 ${right ? "flex-row-reverse" : ""}`}>
        <span className="truncate text-[15px] font-medium">{shortName(p.name)}</span>
        {logo && <img src={logo} alt={p.nba_team ?? ""} className="h-4 w-4 shrink-0" />}
        {inj && <span className="shrink-0 text-[11px] font-bold text-bad">{inj}</span>}
      </span>
      {g && <span className="mt-0.5 truncate text-[11px] text-muted">{oppLabel(g, p.nba_team_id!, abbr)} <GameStatus g={g} teamId={p.nba_team_id!} /></span>}
    </Link>
  );
}
