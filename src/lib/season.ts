import "server-only";
import { cache } from "react";
import { db } from "./supabase/server";
import { all, rpc } from "./db";
import { addDays, etDay, today } from "./dates";
import { getSettings } from "./league";
import { freezeLineup, isSlot, isStarter, SLOTS, type LineupRow } from "./lineup";
import { gamesBetween } from "./nba";
import { lineupsFrom, savedUpTo } from "./lineup-store";
import { rosters } from "./roster";
import { buildSchedule, conferenceGroups, rehearsalSchedule, semifinalPairs, winner } from "./schedule";
import { CONFERENCES, isConference } from "./conferences";
import { headToHead, playoffChances as chances, tabulate, type Played, type Standing } from "./standings";
import type { Player } from "./league";
import type { RosterPlayer } from "./roster";
import type { Row } from "./supabase/types";

// The season: who plays whom each week, each team's frozen daily lineups and points, scores and standings.

export type Matchup = Row<"matchups">;

// Read once per page (cache): Matchup and standings both need it.
export const matchups = cache(async (teamId?: string): Promise<Matchup[]> => {
  const { season } = await getSettings();
  return all((a, b) => {
    let q = db().from("matchups").select("*").eq("season", season);
    if (teamId) q = q.or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
    return q.order("week").range(a, b);
  });
});

// The week being played now, else the next one, else the last one.
export function currentOf(ms: Matchup[], day = today()) {
  return ms.find((m) => m.starts <= day && day <= m.ends) ?? ms.find((m) => m.starts > day) ?? ms[ms.length - 1] ?? null;
}

// Commissioner: build this season's schedule once every team has joined. Refused once a week has started.
export async function createSchedule(firstDay: string) {
  const { season, leagueSize } = await getSettings();
  const existing = await matchups();
  if (existing.some((m) => !m.is_test && m.starts <= today())) throw new Error("The season has started: the schedule can't be rebuilt.");
  const { data: teams } = await db().from("teams").select("id, conference").order("created_at");
  const ids = (teams ?? []).map((t) => t.id);
  if (ids.length !== leagueSize) throw new Error(`Wait until all ${leagueSize} teams have joined (${ids.length} so far).`);
  const conferenceOf = (id: string) => teams?.find((t) => t.id === id)?.conference;
  const byConference = !!conferenceGroups(ids, conferenceOf);
  const rows = buildSchedule(ids, firstDay, conferenceOf).map((m) => ({ ...m, season }));
  const weeks = rows.filter((m) => m.round === "regular").reduce((a, m) => Math.max(a, m.week), 0);
  const d = db();
  const del = await d.from("matchups").delete().eq("season", season);
  if (del.error) throw new Error(del.error.message);
  // the dress rehearsal's frozen lineups go too (they're all before opening night)
  await d.from("lineup_points").delete().lt("day", firstDay);
  const ins = await d.from("matchups").insert(rows);
  if (ins.error) throw new Error(ins.error.message);
  return byConference
    ? `${weeks} regular season weeks (everyone twice, then your conference once more), then conference semifinals and a final (two weeks each).`
    : `${weeks} regular season weeks, then semifinals and a final (two weeks each).`;
}

// Commissioner: the preseason dress rehearsal. The teams that have joined play a mini season on real NBA
// preseason games (two regular weeks, semifinals, final) so scoring, lineups, the table and the playoffs can be
// checked before opening night. Marked as test: building the real schedule removes it, and its lineups.
export async function createTestSchedule() {
  const { season } = await getSettings();
  const existing = await matchups();
  if (existing.some((m) => !m.is_test)) throw new Error("The real schedule is already built.");
  const d = db();
  const [{ data: teams }, { data: pre }] = await Promise.all([
    d.from("teams").select("id").order("created_at"),
    d.from("games").select("start").eq("season_type", 1).gte("start", new Date().toISOString()).order("start"),
  ]);
  const ids = (teams ?? []).map((t) => t.id);
  if (ids.length < 4) throw new Error("The rehearsal needs at least 4 teams.");
  const days = [...new Set((pre ?? []).map((g) => etDay(g.start)))];
  if (days.length < 4) throw new Error("There isn't enough preseason left to rehearse.");
  const rows = rehearsalSchedule(ids, days[0], days[days.length - 1]).map((m) => ({ ...m, season, is_test: true }));
  const del = await d.from("matchups").delete().eq("season", season).eq("is_test", true);
  if (del.error) throw new Error(del.error.message);
  const ins = await d.from("matchups").insert(rows);
  if (ins.error) throw new Error(ins.error.message);
  return `Rehearsal set: ${days[0]} to ${days[days.length - 1]}, two regular weeks, semifinals, final.`;
}

// ---------- daily lineups and points ----------

// Freeze every team's lineup for a day into lineup_points (and score it). Each player's slot locks at his
// tip-off (freezeLineup): moves and roster changes after his game started don't change that day's points.
export async function snapshotDay(day: string) {
  const d = db();
  const [{ data: teams }, saved, { data: frozenRows }, games] = await Promise.all([
    d.from("teams").select("id"),
    savedUpTo(null, day),
    d.from("lineup_points").select("team_id, slot, player_id").eq("day", day),
    gamesBetween(day, day),
  ]);
  const ids = (teams ?? []).map((t) => t.id);
  const roster = await rosters(ids);
  const built = lineupsFrom(saved, ids, day, roster);
  const frozen = frozenRows ?? [];

  // Tip-off of each player's game that day, once it has started. Frozen players may have left the roster since.
  const nbaTeam = new Map(roster.map((p) => [p.id, p.nba_team_id]));
  const gone = [...new Set(frozen.map((r) => r.player_id).filter((id) => !nbaTeam.has(id)))];
  if (gone.length) {
    const { data } = await d.from("players").select("id, nba_team_id").in("id", gone);
    for (const p of data ?? []) nbaTeam.set(p.id, p.nba_team_id);
  }
  const now = Date.now();
  const tipOf = new Map<string, number>();
  for (const g of games) {
    const t = Date.parse(g.start);
    if (t <= now) for (const id of [g.home_team_id, g.away_team_id]) tipOf.set(id, Math.min(tipOf.get(id) ?? Infinity, t));
  }
  const tip = (playerId: string) => {
    const team = nbaTeam.get(playerId);
    return team ? tipOf.get(team) : undefined;
  };

  const rows = ids.flatMap((team_id) => {
    const save = saved.filter((r) => r.team_id === team_id);
    const savedAt = save.length ? Math.max(...save.map((r) => Date.parse(r.saved_at))) : null;
    const before = frozen.filter((r) => r.team_id === team_id).map((r) => ({ slot: r.slot, playerId: r.player_id }));
    return freezeLineup(built.get(team_id) ?? [], before, tip, savedAt)
      .filter((r) => isSlot(r.slot))
      .map((r) => ({ team_id, slot: r.slot, player_id: r.playerId }));
  });
  await rpc("snapshot_lineups", { p_day: day, p_rows: rows });
}

// Called by the scores timer (and after lineup changes). Looks at every matchup day of the last week:
// today is re-frozen (slots lock at tip-off), any earlier day never frozen gets frozen now (catch-up after an
// outage), and all of them are recounted, so points always match the stored box scores.
export async function refreshScores() {
  const ms = await matchups();
  const now = today();
  const days: string[] = [];
  for (let k = 7; k >= 0; k--) {
    const d = addDays(now, -k);
    if (ms.some((m) => m.starts <= d && d <= m.ends)) days.push(d);
  }
  if (!days.length) return { days: 0 };
  await fillPlayoffs(ms);
  const done = await all((a, b) => db().from("lineup_points").select("day").gte("day", days[0]).lte("day", now).range(a, b));
  const frozenDays = new Set(done.map((r) => r.day));
  const caughtUp: string[] = [];
  for (const day of days) {
    if (day === now) await snapshotDay(day);
    else if (!frozenDays.has(day)) {
      await snapshotDay(day);
      caughtUp.push(day);
    }
  }
  await rpc("score_lineup_points", { p_from: days[0], p_to: now });
  return { days: days.length, caughtUp };
}

// Playoff teams fill in as soon as the round before is over: semis 1 v 4 and 2 v 3, then the two winners.
async function fillPlayoffs(ms: Matchup[]) {
  const now = today();
  const regular = ms.filter((m) => m.round === "regular");
  const semis = ms.filter((m) => m.round === "semi");
  const final = ms.find((m) => m.round === "final");
  const set = async (id: string, home: string, away: string) => {
    const { error } = await db().from("matchups").update({ home_team_id: home, away_team_id: away }).eq("id", id);
    if (error) throw new Error(error.message);
  };
  const regularOver = regular.length > 0 && regular.every((m) => m.ends < now);
  if (regularOver && semis.length === 2 && semis.some((m) => !m.home_team_id)) {
    const ids = [...new Set(regular.flatMap((m) => [m.home_team_id!, m.away_team_id!]))];
    const [table, { data: teams }] = await Promise.all([standings(ids), db().from("teams").select("id, conference").in("id", ids)]);
    const seeds = table.map((s) => s.teamId);
    // with conferences: each one's top two, in the league's conference order (Paris, then London)
    const conf = (id: string) => teams?.find((t) => t.id === id)?.conference;
    const byConference = (teams ?? []).every((t) => isConference(t.conference)) && (teams ?? []).length === ids.length
      ? Object.keys(CONFERENCES).map((c) => seeds.filter((id) => conf(id) === c))
      : undefined;
    const pairs = semifinalPairs(seeds, byConference);
    for (const [i, m] of semis.entries()) await set(m.id, ...pairs[i]);
    return;
  }
  if (final && !final.home_team_id && semis.length === 2 && semis.every((m) => m.home_team_id && m.ends < now)) {
    const s = await scores(semis);
    const [a, b] = semis.map((m) => winner({ home_team_id: m.home_team_id!, away_team_id: m.away_team_id! }, s.get(m.id)!.home, s.get(m.id)!.away));
    await set(final.id, a, b); // the first semifinal's winner hosts
  }
}

export type MatchupScore = { home: number; away: number };
const round1 = (n: number) => Math.round(n * 10) / 10;

// Starters' points in each matchup.
export async function scores(ms: Matchup[]): Promise<Map<string, MatchupScore>> {
  const out = new Map<string, MatchupScore>();
  if (!ms.length) return out;
  const from = ms.reduce((a, m) => (m.starts < a ? m.starts : a), ms[0].starts);
  const to = ms.reduce((a, m) => (m.ends > a ? m.ends : a), ms[0].ends);
  const teams = [...new Set(ms.flatMap((m) => [m.home_team_id, m.away_team_id]))].filter((t): t is string => !!t);
  const days = await all((a, b) => db().from("team_day_points").select("*").in("team_id", teams).gte("day", from).lte("day", to).range(a, b));
  const sum = (team: string | null, m: Matchup) => round1(days.filter((d) => d.team_id === team && d.day! >= m.starts && d.day! <= m.ends).reduce((s, d) => s + Number(d.pts), 0));
  for (const m of ms) out.set(m.id, { home: sum(m.home_team_id, m), away: sum(m.away_team_id, m) });
  return out;
}

// Each player's points while in a starting slot during one matchup week, for both teams.
export async function weekPoints(m: Matchup): Promise<Map<string, number>> {
  const rows = await all((a, b) =>
    db().from("lineup_points").select("team_id, player_id, slot, fpts").in("team_id", [m.home_team_id, m.away_team_id].filter((t): t is string => !!t))
      .gte("day", m.starts).lte("day", m.ends).range(a, b),
  );
  const out = new Map<string, number>();
  for (const r of rows.filter((r) => isStarter(r.slot))) {
    const k = `${r.team_id}:${r.player_id}`;
    out.set(k, round1((out.get(k) ?? 0) + Number(r.fpts)));
  }
  return out;
}

export type { Standing };

// Finished weeks of a kind, with their scores, as the standings count them.
async function played(ms: Matchup[], round?: Matchup["round"]): Promise<Played[]> {
  const done = ms.filter((m) => (!round || m.round === round) && m.home_team_id && m.away_team_id && m.ends < today());
  const s = await scores(done);
  return done.map((m) => ({ week: m.week, home: m.home_team_id!, away: m.away_team_id!, homePts: s.get(m.id)!.home, awayPts: s.get(m.id)!.away }));
}

// Wins and losses from finished regular season weeks (playoffs don't count), with points for and against and the streak.
export async function standings(teamIds: string[]): Promise<Standing[]> {
  return tabulate(teamIds, await played(await matchups(), "regular"));
}

// Two teams' finished meetings this season, playoffs included: [a's wins, b's wins]; null before they have met.
export async function meetings(a: string, b: string): Promise<[number, number] | null> {
  const [wa, wb] = headToHead(a, b, await played(await matchups()));
  return wa + wb ? [wa, wb] : null;
}

// What each team actually fielded on a day that is over, as frozen in lineup_points: the lineup rows (SLOTS order,
// extra bench rows last) and the players who have left the roster since (so the page can still show them, with the
// points they scored for this team). Teams with nothing frozen that day are left out: the page falls back to the saves.
export type Frozen = { lineups: Map<string, LineupRow[]>; gone: RosterPlayer[] };
export async function frozenLineups(teamIds: string[], day: string, roster: RosterPlayer[]): Promise<Frozen> {
  const rows = teamIds.length
    ? await all((a, b) => db().from("lineup_points").select("team_id, slot, player_id").in("team_id", teamIds).eq("day", day).range(a, b))
    : [];
  const lineups = new Map<string, LineupRow[]>();
  for (const team of new Set(rows.map((r) => r.team_id))) {
    const mine = rows.filter((r) => r.team_id === team);
    const at = new Map(mine.map((r) => [r.slot, r.player_id]));
    const out: LineupRow[] = SLOTS.map((slot) => ({ slot, playerId: at.get(slot) ?? null }));
    for (const r of mine) if (!isSlot(r.slot)) out.splice(out.length - 1, 0, { slot: "BE", playerId: r.player_id });
    lineups.set(team, out);
  }
  const known = new Set(roster.map((p) => p.id));
  const missing = [...new Set(rows.filter((r) => !known.has(r.player_id)).map((r) => r.player_id))];
  const { data } = missing.length ? await db().from("players").select("*").in("id", missing) : { data: [] };
  const teamOf = new Map(rows.map((r) => [r.player_id, r.team_id]));
  const gone = ((data ?? []) as Player[]).map((p) => ({ ...p, contract_id: "", salary: 0, years: 0, season_signed: 0, team_id: teamOf.get(p.id)! }));
  return { lineups, gone };
}

// Each team's chance of making the playoffs, in %, from the regular season so far and the weeks still to play
// (standings.ts playoffChances): a sure thing once the table is settled.
export async function playoffChances(teamIds: string[]): Promise<Map<string, number>> {
  const ms = await matchups();
  const now = today();
  const [done, { data: teams }] = await Promise.all([played(ms, "regular"), db().from("teams").select("id, conference").in("id", teamIds)]);
  const upcoming = ms.filter((m) => m.round === "regular" && m.home_team_id && m.away_team_id && m.ends >= now)
    .map((m) => ({ week: m.week, home: m.home_team_id!, away: m.away_team_id! }));
  const byConference = (teams ?? []).length === teamIds.length && (teams ?? []).every((t) => isConference(t.conference))
    ? Object.keys(CONFERENCES).map((c) => teamIds.filter((id) => teams!.find((t) => t.id === id)?.conference === c))
    : null;
  return chances(teamIds, done, upcoming, byConference);
}

// Commissioner changed the scoring weights: recount every box score and lineup day.
export async function rescoreEverything() {
  const { scoring } = await getSettings();
  await rpc("rescore_all", { w: scoring });
}
