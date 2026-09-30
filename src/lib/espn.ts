import "server-only";
import { db } from "./supabase/server";
import { parseInjuries, parseRoster, parseScoreboard, parseSummary, type GameRow, type PlayerRow } from "./espn-parse";

// ESPN's free public data feed (unofficial: if ESPN changes it, espn-parse.ts is the file to fix).
const BASE = process.env.ESPN_BASE ?? "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

type EspnTeams = { sports: { leagues: { teams: { team: { id: string; abbreviation: string } }[] }[] }[] };

// Every NBA roster plus the league injury report -> players table.
export async function syncPlayers() {
  const teams = (await get<EspnTeams>("/teams")).sports[0].leagues[0].teams.map((t) => t.team);
  const rosters = await Promise.all(teams.map((t) => get<Parameters<typeof parseRoster>[0]>(`/teams/${t.id}/roster`).then((r) => parseRoster(r, t))));
  const players: PlayerRow[] = rosters.flat();
  const injuries = new Map(parseInjuries(await get("/injuries")).map((i) => [i.playerId, i]));
  const now = new Date().toISOString();
  const rows = players.map((p) => {
    const inj = injuries.get(p.id);
    return { ...p, injury_status: inj?.status ?? p.injury_status, injury_note: inj?.note ?? null, updated_at: now };
  });
  const { error } = await db().from("players").upsert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

// Save the schedule for a date (YYYYMMDD) and the box score of every game that has started.
export async function syncDay(date: string) {
  const games = parseScoreboard(await get(`/scoreboard?dates=${date}`));
  await saveGames(games);
  let lines = 0;
  for (const g of games.filter((g) => g.state !== "pre")) {
    const { game, lines: rows } = parseSummary(await get(`/summary?event=${g.id}`));
    await saveGames([game]);
    const { error } = await db().from("player_games").upsert(
      rows.map((l) => ({
        game_id: l.gameId, player_id: l.playerId, nba_team_id: l.teamId, played: l.played,
        pts: l.stats.pts, fgm: l.stats.fgm, fga: l.stats.fga, reb: l.stats.reb, ast: l.stats.ast,
        stl: l.stats.stl, blk: l.stats.blk, tov: l.stats.to, tf: l.stats.tf, ej: l.stats.ej, win: l.stats.win,
        fpts: l.points, updated_at: new Date().toISOString(),
      })),
    );
    if (error) throw new Error(error.message);
    lines += rows.length;
  }
  return { games: games.length, lines };
}

async function saveGames(games: GameRow[]) {
  if (!games.length) return;
  const { error } = await db().from("games").upsert(games.map((g) => ({ ...g, updated_at: new Date().toISOString() })));
  if (error) throw new Error(error.message);
}

// Load the whole season schedule (so lineups know every tipoff time). One call per day.
export async function syncSchedule(from: Date, to: Date) {
  let n = 0;
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const games = parseScoreboard(await get(`/scoreboard?dates=${ymd(d)}`));
    await saveGames(games);
    n += games.length;
  }
  return n;
}

// Today and yesterday (US time zones span two UTC dates), used by the scheduled job.
export async function syncRecent() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600_000);
  const a = await syncDay(ymd(yesterday));
  const b = await syncDay(ymd(now));
  return { games: a.games + b.games, lines: a.lines + b.lines };
}
