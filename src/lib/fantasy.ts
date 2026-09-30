import "server-only";
import { db } from "./supabase/server";
import { getSettings, type Player } from "./league";
import { addDays, buildLineup, etDay, isStarter, type LineupRow } from "./lineup";

type Res = PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>;

function fail(e: { message: string; code?: string }): never {
  if (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message)) {
    throw new Error("The database needs updating: run supabase/schema.sql again in the Supabase SQL Editor.");
  }
  throw new Error(e.message);
}

// Supabase returns at most 1000 rows per request: page through bigger reads.
// T is the row shape we asked for (Supabase types joined rows loosely, so this casts like the rest of the app).
async function all<T>(q: (from: number, to: number) => Res): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) fail(error);
    out.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) return out;
  }
}

const chunks = <T>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export const today = () => etDay(new Date());

// ---------- rosters and lineups ----------
export type RosterPlayer = Player & { nba_team_id: string | null; salary: number; years: number; season_signed: number; team_id: string };

// Active contracts, most expensive first (that order also sets a default lineup).
export async function rosters(teamIds: string[]): Promise<RosterPlayer[]> {
  if (!teamIds.length) return [];
  const rows = await all<{ team_id: string; salary: number; years: number; season_signed: number; player: Player & { nba_team_id: string | null } }>((a, b) =>
    db().from("contracts").select("team_id, salary, years, season_signed, player:players(*)").in("team_id", teamIds).eq("active", true)
      .order("salary", { ascending: false }).range(a, b),
  );
  return rows.map((r) => ({ ...r.player, salary: Number(r.salary), years: r.years, season_signed: r.season_signed, team_id: r.team_id }));
}

type SavedRow = { team_id: string; day: string; slot: string; player_id: string };

async function savedRows(teamIds: string[], upTo: string): Promise<SavedRow[]> {
  if (!teamIds.length) return [];
  return all<SavedRow>((a, b) => db().from("lineups").select("*").in("team_id", teamIds).lte("day", upTo).order("day").range(a, b));
}

// The save that applies on `day`: the latest one on or before it.
function savedFor(rows: SavedRow[], teamId: string, day: string) {
  let last: string | null = null;
  for (const r of rows) if (r.team_id === teamId && r.day <= day && (!last || r.day > last)) last = r.day;
  return rows.filter((r) => r.team_id === teamId && r.day === last).map((r) => ({ slot: r.slot, playerId: r.player_id }));
}

export async function lineupFor(teamId: string, day: string, roster: RosterPlayer[]): Promise<LineupRow[]> {
  return buildLineup(savedFor(await savedRows([teamId], day), teamId, day), roster);
}

export async function saveLineup(teamId: string, day: string, rows: LineupRow[]) {
  const d = db();
  const del = await d.from("lineups").delete().eq("team_id", teamId).eq("day", day);
  if (del.error) fail(del.error);
  const keep = rows.filter((r) => r.playerId && r.slot !== "BE").map((r) => ({ team_id: teamId, day, slot: r.slot, player_id: r.playerId! }));
  if (!keep.length) return;
  const ins = await d.from("lineups").insert(keep);
  if (ins.error) fail(ins.error);
}

// ---------- NBA games ----------
export type Game = {
  id: string; start: string; state: "pre" | "in" | "post"; final: boolean;
  home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null;
};

export async function gamesBetween(from: string, to: string): Promise<Game[]> {
  const rows = await all<Game>((a, b) =>
    db().from("games").select("*").gte("start", `${addDays(from, -1)}T00:00:00Z`).lt("start", `${addDays(to, 2)}T00:00:00Z`).order("start").range(a, b),
  );
  return rows.filter((g) => etDay(g.start) >= from && etDay(g.start) <= to);
}

// ESPN team id -> abbreviation (BOS), taken from the players table.
export async function teamAbbrs(): Promise<Map<string, string>> {
  const rows = await all<{ nba_team_id: string | null; nba_team: string | null }>((a, b) =>
    db().from("players").select("nba_team_id, nba_team").not("nba_team_id", "is", null).range(a, b),
  );
  return new Map(rows.map((r) => [r.nba_team_id!, r.nba_team ?? "?"]));
}

// ---------- box scores ----------
export type BoxLine = {
  playerId: string; day: string; min: number; fgm: number; fga: number; reb: number; ast: number;
  stl: number; blk: number; tov: number; ej: number; pts: number; fpts: number;
};

// Every game each player has played (this season), with the US date it was played on.
export async function boxLines(playerIds: string[]): Promise<BoxLine[]> {
  const { season } = await getSettings();
  const seasonStart = `${season}-09-01`;
  const out: BoxLine[] = [];
  for (const ids of chunks([...new Set(playerIds)])) {
    const rows = await all<Omit<BoxLine, "day" | "playerId"> & { player_id: string; game: { start: string } }>((a, b) =>
      db().from("player_games").select("player_id, min, fgm, fga, reb, ast, stl, blk, tov, ej, pts, fpts, game:games(start)")
        .in("player_id", ids).eq("played", true).range(a, b),
    );
    for (const r of rows) {
      const day = etDay(r.game.start);
      if (day < seasonStart) continue;
      out.push({ ...r, playerId: r.player_id, day, fpts: Number(r.fpts) });
    }
  }
  return out;
}

// ---------- matchups ----------
export type Matchup = { id: string; season: number; week: number; starts: string; ends: string; home_team_id: string; away_team_id: string };
export type MatchupScore = { home: number; away: number; byPlayer: Map<string, number> }; // byPlayer key: `${teamId}:${playerId}`

export async function matchups(teamId?: string): Promise<Matchup[]> {
  const { season } = await getSettings();
  return all<Matchup>((a, b) => {
    let q = db().from("matchups").select("*").eq("season", season);
    if (teamId) q = q.or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
    return q.order("week").range(a, b);
  });
}

// The week being played now, else the next one, else the last one.
export function currentOf(ms: Matchup[], day = today()) {
  return ms.find((m) => m.starts <= day && day <= m.ends) ?? ms.find((m) => m.starts > day) ?? ms[ms.length - 1] ?? null;
}

// Starters' fantasy points for each day of each matchup, up to today.
export async function score(ms: Matchup[]): Promise<Map<string, MatchupScore>> {
  const out = new Map<string, MatchupScore>();
  if (!ms.length) return out;
  const now = today();
  const teamIds = [...new Set(ms.flatMap((m) => [m.home_team_id, m.away_team_id]))];
  const lastDay = ms.reduce((a, m) => (m.ends > a ? m.ends : a), ms[0].ends);
  const [roster, saved] = await Promise.all([rosters(teamIds), savedRows(teamIds, lastDay)]);
  const lines = await boxLines([...roster.map((p) => p.id), ...saved.map((s) => s.player_id)]);
  const pts = new Map<string, number>();
  for (const l of lines) pts.set(`${l.playerId}:${l.day}`, (pts.get(`${l.playerId}:${l.day}`) ?? 0) + l.fpts);

  const starters = (teamId: string, day: string) => {
    const s = savedFor(saved, teamId, day);
    // past saves count as they were, even for players since released
    const rows = s.length ? s.map((r) => ({ slot: r.slot, playerId: r.playerId as string | null })) : buildLineup([], roster.filter((p) => p.team_id === teamId));
    return rows.filter((r) => r.playerId && isStarter(r.slot)).map((r) => r.playerId!);
  };

  for (const m of ms) {
    const res: MatchupScore = { home: 0, away: 0, byPlayer: new Map() };
    for (let day = m.starts; day <= m.ends && day <= now; day = addDays(day, 1)) {
      for (const side of ["home", "away"] as const) {
        const teamId = side === "home" ? m.home_team_id : m.away_team_id;
        for (const id of starters(teamId, day)) {
          const p = pts.get(`${id}:${day}`) ?? 0;
          res[side] += p;
          res.byPlayer.set(`${teamId}:${id}`, (res.byPlayer.get(`${teamId}:${id}`) ?? 0) + p);
        }
      }
    }
    res.home = Math.round(res.home * 10) / 10;
    res.away = Math.round(res.away * 10) / 10;
    out.set(m.id, res);
  }
  return out;
}

export type Standing = { teamId: string; w: number; l: number; t: number; pf: number; pa: number };

// Wins and losses from finished weeks only.
export async function standings(teamIds: string[]): Promise<Standing[]> {
  const now = today();
  const done = (await matchups()).filter((m) => m.ends < now);
  const scores = await score(done);
  const table = new Map(teamIds.map((id) => [id, { teamId: id, w: 0, l: 0, t: 0, pf: 0, pa: 0 }]));
  for (const m of done) {
    const s = scores.get(m.id)!;
    const h = table.get(m.home_team_id);
    const a = table.get(m.away_team_id);
    if (!h || !a) continue;
    h.pf += s.home; h.pa += s.away; a.pf += s.away; a.pa += s.home;
    if (s.home > s.away) { h.w++; a.l++; } else if (s.away > s.home) { a.w++; h.l++; } else { h.t++; a.t++; }
  }
  return [...table.values()].sort((x, y) => y.w + y.t / 2 - (x.w + x.t / 2) || y.pf - x.pf);
}
