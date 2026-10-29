import "server-only";
import { rpc } from "./db";
import { db } from "./supabase/server";
import { buildLineup, carryIR, irEligible, isSlot, type LineupRow } from "./lineup";
import type { RosterPlayer } from "./roster";
import { today } from "./dates";

// Saved lineups. A save on a day applies to that day and every later day until the next save.

export type Saved = { team_id: string; day: string; slot: string; player_id: string; saved_at: string };

// Each team's save that applies on `day` (its latest on or before it). null = every team. One query, any season length.
export async function savedUpTo(teamIds: string[] | null, day: string): Promise<Saved[]> {
  if (teamIds && !teamIds.length) return [];
  return rpc("current_lineups", { p_teams: teamIds, p_day: day });
}

// The save that applies to one team on one day: its latest save on or before that day.
function savedFor(rows: Saved[], teamId: string, day: string) {
  let last: string | null = null;
  for (const r of rows) if (r.team_id === teamId && r.day <= day && (!last || r.day > last)) last = r.day;
  return rows.filter((r) => r.team_id === teamId && r.day === last).map((r) => ({ slot: r.slot, playerId: r.player_id }));
}

// The lineup each team fields on a day (saved lineup, filled out with the current roster).
export async function lineupsOn(teamIds: string[], day: string, roster: RosterPlayer[]): Promise<Map<string, LineupRow[]>> {
  return lineupsFrom(await savedUpTo(teamIds, day), teamIds, day, roster);
}

// The same, from saves already read (savedUpTo).
export function lineupsFrom(saved: Saved[], teamIds: string[], day: string, roster: RosterPlayer[]): Map<string, LineupRow[]> {
  return new Map(teamIds.map((t) => [t, buildLineup(savedFor(saved, t, day), roster.filter((p) => p.team_id === t))]));
}

export async function lineupFor(teamId: string, day: string, roster: RosterPlayer[]): Promise<LineupRow[]> {
  return (await lineupsOn([teamId], day, roster)).get(teamId)!;
}

// Players on IR right now (in the IR slot of their team's current lineup) who still belong there: Out, or on the
// NBA's injured reserve. They don't take a roster spot. A player who got better counts again until his GM moves
// him, so a team can't sit a healthy 14th man on IR. No team ids = every team.
export async function onIR(teamIds?: string[]): Promise<Set<string>> {
  const saved = await savedUpTo(teamIds ?? null, today());
  const ids = saved.filter((r) => r.slot === "IR").map((r) => r.player_id);
  if (!ids.length) return new Set();
  const { data } = await db().from("players").select("id, injury_status").in("id", ids);
  return new Set((data ?? []).filter((p) => irEligible(p.injury_status)).map((p) => p.id));
}

// A move on or off IR on `day` is carried to every later day that has its own save (a Quick lineup saved last
// week, say): otherwise that older save would quietly put him back on the bench and the team would show 14 players.
export async function carryIRForward(teamId: string, day: string, roster: RosterPlayer[], ir: { on: string | null; off: string | null }) {
  const { data, error } = await db().from("lineups").select("day, slot, player_id").eq("team_id", teamId).gt("day", day).order("day");
  if (error) throw error;
  for (const d of [...new Set((data ?? []).map((r) => r.day))]) {
    const saved = (data ?? []).filter((r) => r.day === d).map((r) => ({ slot: r.slot, playerId: r.player_id }));
    await saveLineup(teamId, d, carryIR(saved, roster, ir));
  }
}

export async function saveLineup(teamId: string, day: string, rows: LineupRow[]) {
  const keep = rows.filter((r) => r.playerId && isSlot(r.slot)).map((r) => ({ slot: r.slot, player_id: r.playerId! }));
  await rpc("save_lineup", { p_team: teamId, p_day: day, p_rows: keep });
}
