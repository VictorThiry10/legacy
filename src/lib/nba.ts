import "server-only";
import { db } from "./supabase/server";
import { all, chunks } from "./db";
import { addDays, etDay } from "./dates";
import { getSettings } from "./league";
import type { Row } from "./supabase/types";

// Reading the NBA data that espn.ts saves: games, team abbreviations, box scores.

export type Game = Omit<Row<"games">, "state" | "updated_at"> & { state: "pre" | "in" | "post" };

// Games played on US Eastern days from..to (inclusive).
export async function gamesBetween(from: string, to: string): Promise<Game[]> {
  const rows = await all((a, b) =>
    db().from("games").select("*").gte("start", `${addDays(from, -1)}T00:00:00Z`).lt("start", `${addDays(to, 2)}T00:00:00Z`).order("start").range(a, b),
  );
  return rows.filter((g) => etDay(g.start) >= from && etDay(g.start) <= to) as Game[];
}

// ESPN team id -> abbreviation (BOS), taken from the players table.
export async function teamAbbrs(): Promise<Map<string, string>> {
  const rows = await all((a, b) => db().from("players").select("nba_team_id, nba_team").not("nba_team_id", "is", null).range(a, b));
  return new Map(rows.map((r) => [r.nba_team_id!, r.nba_team ?? "?"]));
}

export type BoxLine = {
  playerId: string; day: string; min: number; fgm: number; fga: number; reb: number; ast: number;
  stl: number; blk: number; tov: number; ej: number; pts: number; fpts: number;
};

// Every game each player has played this season, with the US date it was played on.
export async function boxLines(playerIds: string[]): Promise<BoxLine[]> {
  const { season } = await getSettings();
  const seasonStart = `${season}-09-01`;
  const out: BoxLine[] = [];
  for (const ids of chunks([...new Set(playerIds)])) {
    const rows = await all((a, b) =>
      db().from("player_games").select("player_id, min, fgm, fga, reb, ast, stl, blk, tov, ej, pts, fpts, game:games(start)")
        .in("player_id", ids).eq("played", true).range(a, b),
    );
    for (const { player_id, game, ...r } of rows) {
      const day = etDay(game.start);
      if (day >= seasonStart) out.push({ ...r, playerId: player_id, day, fpts: Number(r.fpts) });
    }
  }
  return out;
}
