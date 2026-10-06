import Link from "next/link";
import { getSettings, type TeamSummary } from "@/lib/league";
import { boxLines, gamesBetween, teamAbbrs, type BoxLine } from "@/lib/nba";
import { GameStatus, oppLabel } from "./GameInfo";
import { rosters, type RosterPlayer } from "@/lib/roster";
import { lineupFor } from "@/lib/lineup-store";
import { addDays, isDay, longDate, monthDay, today, weekday } from "@/lib/dates";
import { viewKey, views } from "@/lib/team-views";
import type { SeasonLine } from "@/lib/espn-parse";
import Slide, { BACK, FORWARD } from "./Slide";
import DatePicker from "./DatePicker";
import Pending from "./Pending";
import { draftRow } from "@/lib/draft";
import PushPrompt from "./PushPrompt";
import { money } from "@/lib/rules";
import { headshot } from "@/lib/names";
import { openOffers } from "@/lib/trades";
import { extensionOffer } from "@/lib/extensions";
import { appStatus } from "@/lib/bidding";
import { AUCTION_ON_HOLD } from "@/lib/auction-hold";
import LineupTable, { type LinePlayer } from "./LineupTable";
import BackBar from "./BackBar";
import TeamAvatar from "./TeamAvatar";

type Search = Record<string, string | string[] | undefined>;
const STATS = [
  ["min", "MIN"], ["fgm", "FGM"], ["fgmi", "FGMI"], ["reb", "REB"], ["ast", "AST"],
  ["stl", "STL"], ["blk", "BLK"], ["tov", "TO"], ["ej", "EJ"], ["pts", "PTS"],
] as const;
type Key = (typeof STATS)[number][0];
type Agg = Record<Key, number> & { gp: number; fpts: number };

// ESPN style lineup: one day at a time, a stats view picker, one row per slot. `editable` only for the signed in owner.
export default async function TeamView({ team, editable, base, sp, back, tradeHref }: {
  team: TeamSummary; editable: boolean; base: string; sp: Search; back?: string; tradeHref?: string; // tradeHref: a Trade button in the back bar
}) {
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const now = today();
  const day = isDay(str("d")) ? str("d") : now;
  const period = viewKey(str("stat"));
  const href = (o: Record<string, string>) => {
    const q = new URLSearchParams({ d: day, stat: period, ...o });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `${base}?${q}`;
  };

  // my to-do card (rookie draft, free agency, trade offers, extensions): starts now, shown by Pending below
  const offers = editable ? openOffers(team.id) : null;
  const extensions = editable ? extensionOffer(team).catch(() => null) : null;
  // on hold: no row for the GMs (the commissioner keeps his, to set the auction up and try it), but still a promise
  // (the card below is shown when all four are there)
  const freeAgency = editable ? (AUCTION_ON_HOLD && !team.is_commish ? Promise.resolve(null) : appStatus(team).catch(() => null)) : null;
  const rookieDraft = editable ? draftRow(team).catch(() => null) : null;
  const [{ rules, season }, roster, games, abbr] = await Promise.all([getSettings(), rosters([team.id]), gamesBetween(day, day), teamAbbrs()]);
  const [rows, lines] = await Promise.all([lineupFor(team.id, day, roster), boxLines(roster.map((p) => p.id))]);
  const players = new Map(roster.map((p) => [p.id, p]));
  const gameOf = (p?: RosterPlayer) => (p?.nba_team_id ? games.find((g) => g.home_team_id === p.nba_team_id || g.away_team_id === p.nba_team_id) : undefined);
  const locked = (p?: RosterPlayer) => day < now || (!!gameOf(p) && new Date(gameOf(p)!.start) <= new Date());
  const inPeriod = (l: BoxLine) =>
    period === "day" ? l.day === day : period === "season" ? true : l.day > addDays(now, -Number(period)) && l.day <= now;
  const agg = (id: string): Agg => {
    if (period === "last") {
      // last season's totals, from ESPN (saved on each player)
      const s = players.get(id)?.last_season as SeasonLine | null | undefined;
      if (!s?.gp) return { gp: 0, fpts: 0, min: 0, fgm: 0, fgmi: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, ej: 0, pts: 0 };
      return { gp: s.gp, fpts: s.fpts, min: s.min, fgm: s.fgm, fgmi: s.fga - s.fgm, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.to, ej: s.ej, pts: s.pts };
    }
    const a: Agg = { gp: 0, fpts: 0, min: 0, fgm: 0, fgmi: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, ej: 0, pts: 0 };
    for (const l of lines) {
      if (l.playerId !== id || !inPeriod(l)) continue;
      a.gp++; a.fpts += l.fpts; a.min += l.min; a.fgm += l.fgm; a.fgmi += l.fga - l.fgm; a.reb += l.reb;
      a.ast += l.ast; a.stl += l.stl; a.blk += l.blk; a.tov += l.tov; a.ej += l.ej; a.pts += l.pts;
    }
    return a;
  };
  // Everything after the slot pill and photo, for one player (or an empty slot).
  const cells = (p: RosterPlayer | null, g: ReturnType<typeof gameOf>) => {
    const a = p ? agg(p.id) : null;
    const val = (k: Key) => (!a || !a.gp ? "--" : period !== "day" ? (a[k] / a.gp).toFixed(1) : String(a[k]));
    return [
      <td key="pts" className="num text-right font-semibold">{a?.gp ? round(a.fpts) : <span className="text-muted">--</span>}</td>,
      <td key="avg" className="num text-right">{a?.gp ? (a.fpts / a.gp).toFixed(1) : <span className="text-muted">--</span>}</td>,
      <td key="opp">{g && p ? oppLabel(g, p.nba_team_id!, abbr) : <span className="text-muted">--</span>}</td>,
      <td key="status" className="text-xs">{g && p ? <GameStatus g={g} teamId={p.nba_team_id!} /> : <span className="text-muted">--</span>}</td>,
      ...STATS.map(([k]) => <td key={k} className={`num text-right ${val(k) === "--" ? "text-muted" : ""}`}>{val(k)}</td>),
    ];
  };
  const linePlayers: Record<string, LinePlayer> = Object.fromEntries(
    roster.map((p) => [p.id, {
      id: p.id, name: p.name, position: p.position, injury_status: p.injury_status,
      headshot: headshot(p.headshot, 110), locked: locked(p),
      info: (
        <div className="leading-tight">
          <Link href={`/players/${p.id}`} prefetch={false} transitionTypes={FORWARD} className="font-medium hover:underline">{p.name}</Link>
          <div className="text-[11px] text-muted">
            {p.nba_team} · {p.position}
            {p.injury_status && <span className="text-bad" title={p.injury_note ?? ""}> · {p.injury_status}</span>}
          </div>
        </div>
      ),
      cells: <>{cells(p, gameOf(p))}</>,
    }]),
  );
  const periodName = views(day, season).find((v) => v.key === period)!.label;
  const dayName = `${weekday(day).charAt(0)}${weekday(day).slice(1).toLowerCase()}, ${monthDay(day)}`;
  const viewsHref = `/team/views?${new URLSearchParams({ back: base, d: day, stat: period })}`;

  return (
    <Slide>
    <div className="space-y-4">
      {back ? (
        <BackBar
          href={back}
          title={<span className="flex items-center gap-2"><TeamAvatar name={team.name} size="sm" />{team.name}</span>}
          sub={<>{team.manager_name ?? team.manager_email} · {team.state.rosterCount}/{rules.rosterMax} players · <span className={team.capSpace < 0 ? "text-bad" : ""}>{money(team.capSpace)} cap space</span></>}
          right={tradeHref && <Link href={tradeHref} transitionTypes={FORWARD} className="shrink-0 rounded-full bg-blue-fill px-4 py-1.5 text-sm font-semibold text-white">Trade</Link>}
        />
      ) : (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <h1 className="text-xl font-semibold">{team.name}</h1>
            <p className="text-muted text-sm">
              {team.manager_name ?? team.manager_email} · {team.state.rosterCount}/{rules.rosterMax} players · {money(team.state.salary)} salary ·{" "}
              <span className={team.capSpace < 0 ? "text-bad" : ""}>{money(team.capSpace)} cap space</span>
            </p>
          </div>
        </div>
      )}

      {editable && <PushPrompt />}
      {offers && extensions && freeAgency && rookieDraft && <Pending offers={offers} extensions={extensions} freeAgency={freeAgency} rookieDraft={rookieDraft} />}

      <div className="flex items-center border-y border-line -mx-4 sm:mx-0 sm:rounded-xl sm:border sm:bg-card">
        <Link href={href({ d: addDays(day, -1) })} replace={!!back} prefetch={true} transitionTypes={BACK} className="px-4 py-2 text-xl text-muted hover:text-fg" aria-label="Previous day">‹</Link>
        <div className="flex-1 text-center leading-tight">
          <DatePicker
            day={day} today={now} label={dayName} path={base}
            params={{ stat: period }} from={`${season}-10-01`} to={`${season + 1}-06-30`} replace={!!back}
          />
          {day !== now && (
            <Link href={href({ d: now })} replace={!!back} transitionTypes={day < now ? FORWARD : BACK} className="block text-[10px] uppercase tracking-wide text-muted hover:text-fg">Today</Link>
          )}
        </div>
        <Link href={href({ d: addDays(day, 1) })} replace={!!back} prefetch={true} transitionTypes={FORWARD} className="px-4 py-2 text-xl text-muted hover:text-fg" aria-label="Next day">›</Link>
      </div>

      <Link href={viewsHref} transitionTypes={FORWARD} className="flex items-center justify-center gap-1.5 rounded-full border-[1.5px] border-accent py-2 text-sm font-semibold text-accent hover:bg-accent/10">
        {periodName}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </Link>

      <Slide key={day}>
      <div className="space-y-4">
        <LineupTable
          rows={rows}
          players={linePlayers}
          day={day}
          editable={editable && day >= now}
          empty={<>{cells(null, undefined)}</>}
          head={
            <thead>
              <tr className="hidden sm:table-row [&>th]:text-center [&>th]:border-r [&>th]:border-line">
                <th colSpan={2}>Starters</th>
                <th colSpan={2}>Fantasy pts</th>
                <th colSpan={2}>{longDate(day)}</th>
                <th colSpan={STATS.length} className="!border-r-0">{periodName}{period !== "day" ? " · per game" : ""}</th>
              </tr>
              <tr>
                <th className="sticky left-0 z-10 [transform:translateZ(0)] shadow-[2px_0_3px_-2px_rgba(0,0,0,0.25)] bg-card">Starters</th><th />
                <th className="text-right">{period === "day" ? "Score" : "Pts"}</th><th className="text-right">Avg</th>
                <th>Opp</th><th>Status</th>
                {STATS.map(([k, label]) => <th key={k} className="text-right">{label}</th>)}
              </tr>
            </thead>
          }
        />
      </div>
      </Slide>
    </div>
    </Slide>
  );
}

const round = (n: number) => String(Math.round(n * 10) / 10);
