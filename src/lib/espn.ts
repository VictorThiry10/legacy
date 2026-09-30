import "server-only";
import { db } from "./supabase/server";
import { getSettings } from "./league";
import { parseInjuries, parseNews, parseOverview, parseRoster, parseScoreboard, parseSeasonStats, parseSummary, type GameRow, type PlayerRow } from "./espn-parse";

// ESPN's free public data feed (unofficial: if ESPN changes it, espn-parse.ts is the file to fix).
const BASE = process.env.ESPN_BASE ?? "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
// Second ESPN feed with season totals and player pages.
const WEB = process.env.ESPN_WEB_BASE ?? "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";

async function get<T>(path: string, base = BASE): Promise<T> {
  const res = await fetch(`${base}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

type EspnTeams = { sports: { leagues: { teams: { team: { id: string; abbreviation: string } }[] }[] }[] };

// Every NBA roster, the league injury report and last season's stat line -> players table.
export async function syncPlayers() {
  const { season } = await getSettings();
  const teams = (await get<EspnTeams>("/teams")).sports[0].leagues[0].teams.map((t) => t.team);
  const rosters = await Promise.all(teams.map((t) => get<Parameters<typeof parseRoster>[0]>(`/teams/${t.id}/roster`).then((r) => parseRoster(r, t))));
  const players: PlayerRow[] = rosters.flat();
  const injuries = new Map(parseInjuries(await get("/injuries")).map((i) => [i.playerId, i]));
  // ESPN names a season by the year it ends: our 2026-27 season's "last season" is ESPN's 2026.
  const last = await lastSeasonStats(season);
  const now = new Date().toISOString();
  const rows = players.map((p) => {
    const inj = injuries.get(p.id);
    return { ...p, injury_status: inj?.status ?? p.injury_status, injury_note: inj?.note ?? null, last_season: last.get(p.id) ?? null, updated_at: now };
  });
  const { error } = await db().from("players").upsert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

// Save the schedule for a date (YYYYMMDD) and the box score of every game that has started.
// Games already saved as final are skipped (their box score can't change), unless force is set.
export async function syncDay(date: string, force = false) {
  const games = parseScoreboard(await get(`/scoreboard?dates=${date}`));
  const { data: done } = force || !games.length
    ? { data: [] as { id: string }[] }
    : await db().from("games").select("id").in("id", games.map((g) => g.id)).eq("final", true);
  const finished = new Set((done ?? []).map((g) => g.id));
  await saveGames(games);
  let lines = 0;
  for (const g of games.filter((g) => g.state !== "pre" && !finished.has(g.id))) {
    const { game, lines: rows } = parseSummary(await get(`/summary?event=${g.id}`));
    await saveGames([game]);
    const { error } = await db().from("player_games").upsert(
      rows.map((l) => ({
        game_id: l.gameId, player_id: l.playerId, nba_team_id: l.teamId, played: l.played, min: l.min,
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

async function lastSeasonStats(year: number) {
  try {
    return parseSeasonStats(await get(`/statistics/byathlete?isqualified=false&page=1&limit=1000&season=${year}&seasontype=2`, WEB));
  } catch {
    return new Map(); // stats are a bonus: never block the roster refresh
  }
}

// One player's latest note, outlook, ranks and headlines (fetched when their page opens).
export async function playerOverview(id: string) {
  try {
    return parseOverview(await get(`/athletes/${encodeURIComponent(id)}/overview`, WEB));
  } catch {
    return null;
  }
}

// League news feed.
export async function leagueNews() {
  try {
    return parseNews(await get("/news?limit=50"));
  } catch {
    return [];
  }
}

// ---------- automatic refresh ----------
// Called every 10 minutes by a timer. Each part has its own rhythm, remembered in the sync_log table,
// so calling it more often (or by a stranger) never does extra work.
async function due(name: string, minutes: number) {
  const d = db();
  const { data } = await d.from("sync_log").select("last_run").eq("name", name).maybeSingle();
  if (data && Date.now() - new Date(data.last_run).getTime() < minutes * 60_000) return false;
  await d.from("sync_log").upsert({ name, last_run: new Date().toISOString() });
  return true;
}

async function attempt<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function autoRefresh() {
  if (!(await due("scores", 4))) return { skipped: "ran less than 4 minutes ago" };
  const out: Record<string, unknown> = { scores: await attempt(syncRecent) };
  if (await due("players", 55)) out.players = await attempt(syncPlayers);
  if (await due("schedule", 60 * 24 - 10)) {
    const day = 24 * 3600_000;
    out.schedule = await attempt(() => syncSchedule(new Date(Date.now() - day), new Date(Date.now() + 14 * day)));
  }
  return out;
}

export async function lastRuns() {
  const { data } = await db().from("sync_log").select("name, last_run");
  return Object.fromEntries((data ?? []).map((r) => [r.name as string, r.last_run as string]));
}
