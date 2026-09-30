import "server-only";
import { db } from "./supabase/server";
import { all, rpc } from "./db";
import { addDays, today } from "./dates";
import { getSettings } from "./league";
import { isSlot, isStarter } from "./lineup";
import { lineupsOn } from "./lineup-store";
import { rosters } from "./roster";
import { buildSchedule } from "./schedule";
import type { Row } from "./supabase/types";

// The season: who plays whom each week, each team's frozen daily lineups and points, scores and standings.

export type Matchup = Row<"matchups">;

export async function matchups(teamId?: string): Promise<Matchup[]> {
  const { season } = await getSettings();
  return all((a, b) => {
    let q = db().from("matchups").select("*").eq("season", season);
    if (teamId) q = q.or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
    return q.order("week").range(a, b);
  });
}

// The week being played now, else the next one, else the last one.
export function currentOf(ms: Matchup[], day = today()) {
  return ms.find((m) => m.starts <= day && day <= m.ends) ?? ms.find((m) => m.starts > day) ?? ms[ms.length - 1] ?? null;
}

// Commissioner: (re)build this season's schedule. Refused once a week has started.
export async function createSchedule(firstDay: string, weeks: number) {
  const { season } = await getSettings();
  const existing = await matchups();
  if (existing.some((m) => m.starts <= today())) throw new Error("The season has started: the schedule can't be rebuilt.");
  const { data: teams } = await db().from("teams").select("id").order("created_at");
  const ids = (teams ?? []).map((t) => t.id);
  if (ids.length < 2) throw new Error("Need at least 2 teams.");
  const rows = buildSchedule(ids, firstDay, weeks).map((m) => ({ ...m, season }));
  const d = db();
  const del = await d.from("matchups").delete().eq("season", season);
  if (del.error) throw new Error(del.error.message);
  const ins = await d.from("matchups").insert(rows);
  if (ins.error) throw new Error(ins.error.message);
  return `${weeks} weeks, ${rows.length} matchups.`;
}

// ---------- daily lineups and points ----------

// Freeze every team's lineup for a day into lineup_points (and score it).
export async function snapshotDay(day: string) {
  const { data: teams } = await db().from("teams").select("id");
  const ids = (teams ?? []).map((t) => t.id);
  const lineups = await lineupsOn(ids, day, await rosters(ids));
  const rows = [...lineups].flatMap(([team_id, rows]) =>
    rows.filter((r) => r.playerId && isSlot(r.slot)).map((r) => ({ team_id, slot: r.slot, player_id: r.playerId! })),
  );
  await rpc("snapshot_lineups", { p_day: day, p_rows: rows });
}

// Called by the 10 minute refresh (and after lineup changes): today's lineups are re-frozen, yesterday's is only
// frozen if it never was (so later roster moves can't rewrite it), and both days' points are recounted.
export async function refreshScores() {
  const ms = await matchups();
  const now = today();
  const days = [addDays(now, -1), now].filter((d) => ms.some((m) => m.starts <= d && d <= m.ends));
  if (!days.length) return { days: 0 };
  for (const day of days) {
    const { count } = await db().from("lineup_points").select("team_id", { count: "exact", head: true }).eq("day", day);
    if (day === now || !count) await snapshotDay(day);
  }
  await rpc("score_lineup_points", { p_from: days[0], p_to: days[days.length - 1] });
  return { days: days.length };
}

export type MatchupScore = { home: number; away: number };
const round1 = (n: number) => Math.round(n * 10) / 10;

// Starters' points in each matchup.
export async function scores(ms: Matchup[]): Promise<Map<string, MatchupScore>> {
  const out = new Map<string, MatchupScore>();
  if (!ms.length) return out;
  const from = ms.reduce((a, m) => (m.starts < a ? m.starts : a), ms[0].starts);
  const to = ms.reduce((a, m) => (m.ends > a ? m.ends : a), ms[0].ends);
  const teams = [...new Set(ms.flatMap((m) => [m.home_team_id, m.away_team_id]))];
  const days = await all((a, b) => db().from("team_day_points").select("*").in("team_id", teams).gte("day", from).lte("day", to).range(a, b));
  const sum = (team: string, m: Matchup) => round1(days.filter((d) => d.team_id === team && d.day! >= m.starts && d.day! <= m.ends).reduce((s, d) => s + Number(d.pts), 0));
  for (const m of ms) out.set(m.id, { home: sum(m.home_team_id, m), away: sum(m.away_team_id, m) });
  return out;
}

// Each player's points while in a starting slot during one matchup week, for both teams.
export async function weekPoints(m: Matchup): Promise<Map<string, number>> {
  const rows = await all((a, b) =>
    db().from("lineup_points").select("team_id, player_id, slot, fpts").in("team_id", [m.home_team_id, m.away_team_id])
      .gte("day", m.starts).lte("day", m.ends).range(a, b),
  );
  const out = new Map<string, number>();
  for (const r of rows.filter((r) => isStarter(r.slot))) {
    const k = `${r.team_id}:${r.player_id}`;
    out.set(k, round1((out.get(k) ?? 0) + Number(r.fpts)));
  }
  return out;
}

export type Standing = { teamId: string; w: number; l: number; t: number; pf: number; pa: number };

// Wins and losses from finished weeks only.
export async function standings(teamIds: string[]): Promise<Standing[]> {
  const done = (await matchups()).filter((m) => m.ends < today());
  const s = await scores(done);
  const table = new Map(teamIds.map((id) => [id, { teamId: id, w: 0, l: 0, t: 0, pf: 0, pa: 0 }]));
  for (const m of done) {
    const { home, away } = s.get(m.id)!;
    const h = table.get(m.home_team_id), a = table.get(m.away_team_id);
    if (!h || !a) continue;
    h.pf += home; h.pa += away; a.pf += away; a.pa += home;
    if (home > away) { h.w++; a.l++; } else if (away > home) { a.w++; h.l++; } else { h.t++; a.t++; }
  }
  return [...table.values()].sort((x, y) => y.w + y.t / 2 - (x.w + x.t / 2) || y.pf - x.pf);
}

// Commissioner changed the scoring weights: recount every box score and lineup day.
export async function rescoreEverything() {
  const { scoring } = await getSettings();
  await rpc("rescore_all", { w: scoring });
}
