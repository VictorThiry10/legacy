import "server-only";
import { rpc } from "./db";
import { buildLineup, isSlot, type LineupRow } from "./lineup";
import type { RosterPlayer } from "./roster";
import { today } from "./dates";

// Saved lineups. A save on a day applies to that day and every later day until the next save.

type Saved = { team_id: string; day: string; slot: string; player_id: string };

// Each team's save that applies on `day` (its latest on or before it). null = every team. One query, any season length.
async function savedUpTo(teamIds: string[] | null, day: string): Promise<Saved[]> {
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
  const saved = await savedUpTo(teamIds, day);
  return new Map(teamIds.map((t) => [t, buildLineup(savedFor(saved, t, day), roster.filter((p) => p.team_id === t))]));
}

export async function lineupFor(teamId: string, day: string, roster: RosterPlayer[]): Promise<LineupRow[]> {
  return (await lineupsOn([teamId], day, roster)).get(teamId)!;
}

// Players on IR right now (in the IR slot of their team's current lineup). They don't take a roster spot.
// No team ids = every team.
export async function onIR(teamIds?: string[]): Promise<Set<string>> {
  const saved = await savedUpTo(teamIds ?? null, today());
  return new Set(saved.filter((r) => r.slot === "IR").map((r) => r.player_id));
}

export async function saveLineup(teamId: string, day: string, rows: LineupRow[]) {
  const keep = rows.filter((r) => r.playerId && isSlot(r.slot)).map((r) => ({ slot: r.slot, player_id: r.playerId! }));
  await rpc("save_lineup", { p_team: teamId, p_day: day, p_rows: keep });
}
