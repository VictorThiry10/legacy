import "server-only";
import { db } from "./supabase/server";
import { all, rpc } from "./db";
import { buildLineup, isSlot, type LineupRow } from "./lineup";
import type { RosterPlayer } from "./roster";

// Saved lineups. A save on a day applies to that day and every later day until the next save.

type Saved = { team_id: string; day: string; slot: string; player_id: string };

async function savedUpTo(teamIds: string[], day: string): Promise<Saved[]> {
  if (!teamIds.length) return [];
  return all((a, b) => db().from("lineups").select("*").in("team_id", teamIds).lte("day", day).order("day").range(a, b));
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

export async function saveLineup(teamId: string, day: string, rows: LineupRow[]) {
  const keep = rows.filter((r) => r.playerId && isSlot(r.slot)).map((r) => ({ slot: r.slot, player_id: r.playerId! }));
  await rpc("save_lineup", { p_team: teamId, p_day: day, p_rows: keep });
}
