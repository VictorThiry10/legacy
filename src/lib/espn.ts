import { unstable_cache } from "next/cache";
import "server-only";
import { db } from "./supabase/server";
import { getSettings } from "./league";
import { refreshScores } from "./season";
import { parseEligibility, parseInjuries, parseOverview, parseProjections, parseRoster, parseScoreboard, parseSeasonStats, parseSummary, type GameRow, type PlayerRow } from "./espn-parse";
import { etDay } from "./dates";
import { injuryChanges, injuryMessage } from "./injuries";
import { notifyTeams } from "./push";

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

// Every NBA roster, last season's stat line and this season's projection -> players table. Injuries are left to
// syncInjuries (run at the end), so a player's status only ever changes in one place.
export async function syncPlayers() {
  const { season } = await getSettings();
  const teams = (await get<EspnTeams>("/teams")).sports[0].leagues[0].teams.map((t) => t.team);
  const rosters = await Promise.all(teams.map((t) => get<Parameters<typeof parseRoster>[0]>(`/teams/${t.id}/roster`).then((r) => parseRoster(r, t))));
  const players: PlayerRow[] = rosters.flat();
  // ESPN names a season by the year it ends: our 2026-27 season's "last season" is ESPN's 2026.
  const [last, positions, projected] = await Promise.all([lastSeasonStats(season), fantasyPositions(season), projections(season)]);
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the roster feed's own injury tag is dropped on purpose
  const rows = players.map(({ injury_status, ...p }) => ({ ...p, position: positions.get(p.id) ?? p.position, last_season: last.get(p.id) ?? null, projection: projected.get(p.id) ?? null, updated_at: now }));
  const { error } = await db().from("players").upsert(rows);
  if (error) throw new Error(error.message);
  await attempt(syncInjuries);
  return rows.length;
}

// ESPN's league injury report -> players' injury status and note. Only players whose status changed are written,
// and for each one on a fantasy roster, that GM gets a push: hurt, ruled out, upgraded, or cleared.
// Runs every 10 minutes, and after each player refresh.
export async function syncInjuries() {
  const report = new Map(parseInjuries(await get("/injuries")).map((i) => [i.playerId, i]));
  const { data: players, error } = await db().from("players").select("id, name, injury_status, injury_note").limit(2000);
  if (error) throw new Error(error.message);
  const changes = injuryChanges(players ?? [], report);
  if (!changes) return { skipped: "ESPN's injury report looks cut short" };
  for (const c of changes) await db().from("players").update({ injury_status: c.to, injury_note: c.note }).eq("id", c.playerId);
  // a new note on the same status is saved quietly
  const changed = new Set(changes.map((c) => c.playerId));
  for (const p of players ?? []) {
    const note = report.get(p.id)?.note ?? null;
    if (!changed.has(p.id) && p.injury_status && note !== p.injury_note) await db().from("players").update({ injury_note: note }).eq("id", p.id);
  }
  if (!changes.length) return { changes: 0 };
  const { data: owned } = await db().from("contracts").select("player_id, team_id").eq("active", true).in("player_id", changes.map((c) => c.playerId));
  let pushed = 0;
  for (const c of changes) {
    const owner = owned?.find((o) => o.player_id === c.playerId);
    if (owner) pushed += await notifyTeams([owner.team_id], { ...injuryMessage(c), url: `/players/${c.playerId}`, tag: `injury-${c.playerId}` });
  }
  return { changes: changes.length, pushed };
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
  const { scoring } = await getSettings();
  await saveGames(games);
  let lines = 0;
  for (const g of games.filter((g) => g.state !== "pre" && !finished.has(g.id))) {
    const { game, lines: rows } = parseSummary(await get(`/summary?event=${g.id}`), scoring);
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
    const { scoring } = await getSettings();
    return parseSeasonStats(await get(`/statistics/byathlete?isqualified=false&page=1&limit=1000&season=${year}&seasontype=2`, WEB), scoring);
  } catch {
    return new Map(); // stats are a bonus: never block the roster refresh
  }
}

// Fantasy positions from ESPN's fantasy game (season named by the year it ends, e.g. 2027 for 2026-27).
const FANTASY = process.env.ESPN_FANTASY_BASE ?? "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba";
async function fantasyPositions(season: number) {
  try {
    const res = await fetch(`${FANTASY}/seasons/${season + 1}/players?view=players_wl`, {
      cache: "no-store",
      headers: { "x-fantasy-filter": JSON.stringify({ filterActive: { value: true } }) },
    });
    if (!res.ok) throw new Error(String(res.status));
    return parseEligibility(await res.json());
  } catch {
    return new Map<string, string>(); // keep ESPN's basic G / F / C if this feed is down
  }
}

// ESPN's projected stat line for every player, for the season being played (ESPN names it by the year it ends).
async function projections(season: number) {
  try {
    const { scoring } = await getSettings();
    const res = await fetch(`${FANTASY}/seasons/${season + 1}/segments/0/leaguedefaults/3?view=kona_player_info`, {
      cache: "no-store",
      headers: {
        "x-fantasy-filter": JSON.stringify({
          players: { limit: 1500, sortPercOwned: { sortPriority: 1, sortAsc: false }, filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: [`10${season + 1}`] } },
        }),
      },
    });
    if (!res.ok) throw new Error(String(res.status));
    return parseProjections(await res.json(), season + 1, scoring);
  } catch {
    return new Map(); // a bonus, like last season's stats: never block the roster refresh
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

// The same, kept for 15 minutes: ESPN is the slowest thing a player page waits on, and it changes slowly.
// Throws when ESPN fails, so a failure is never kept: callers catch.
export const playerOverviewCached = unstable_cache(
  async (id: string) => parseOverview(await get(`/athletes/${encodeURIComponent(id)}/overview`, WEB)),
  ["espn-player-overview"],
  { revalidate: 900 },
);

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
  // The timer calls every 2 minutes: real work every couple of minutes while games are on, every 10 otherwise.
  const live = await gamesOnNow();
  if (!(await due("scores", live ? 1.5 : 9.5))) return { skipped: live ? "ran under 2 minutes ago" : "no games on; ran under 10 minutes ago" };
  const out: Record<string, unknown> = { scores: await attempt(syncRecent) };
  if (await due("catch-up", 30)) out.catchUp = await attempt(catchUpGames);
  out.fantasy = await attempt(refreshScores); // after box scores, so lineups score the latest stats
  if (await due("players", 55)) out.players = await attempt(syncPlayers); // ends with the injury report
  else if (await due("injuries", 9)) out.injuries = await attempt(syncInjuries);
  if (await due("schedule", 60 * 24 - 10)) {
    const day = 24 * 3600_000;
    out.schedule = await attempt(() => syncSchedule(new Date(Date.now() - day), new Date(Date.now() + 14 * day)));
  }
  return out;
}

// A game is on, or tips off within 15 minutes (games last under 4 hours).
async function gamesOnNow() {
  const now = Date.now();
  const { count } = await db().from("games").select("id", { count: "exact", head: true }).eq("final", false)
    .gte("start", new Date(now - 4 * 3600_000).toISOString()).lte("start", new Date(now + 15 * 60_000).toISOString());
  return (count ?? 0) > 0;
}

// Box scores for any game of the last week that started but isn't final in our records: after an outage,
// the first run back fills every missed day. (Yesterday and today are covered by every run.)
async function catchUpGames() {
  const now = Date.now();
  const { data } = await db().from("games").select("start").eq("final", false)
    .gte("start", new Date(now - 8 * 24 * 3600_000).toISOString()).lt("start", new Date(now - 36 * 3600_000).toISOString());
  const days = [...new Set((data ?? []).map((g) => etDay(g.start)))];
  let lines = 0;
  for (const day of days) lines += (await syncDay(day.replace(/-/g, ""))).lines;
  return { days, lines };
}

export async function lastRuns() {
  const { data } = await db().from("sync_log").select("name, last_run");
  return Object.fromEntries((data ?? []).map((r) => [r.name as string, r.last_run as string]));
}
