import "server-only";
import { cache } from "react";
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

// ESPN team id -> abbreviation (BOS): 30 rows from the nba_teams view.
export async function teamAbbrs(): Promise<Map<string, string>> {
  const { data } = await db().from("nba_teams").select("id, abbr");
  return new Map((data ?? []).map((r) => [r.id!, r.abbr ?? "?"]));
}

// Has the NBA regular season tipped off? Until then, stats show preseason games (handy for testing);
// from opening night on, preseason games drop out of every stat.
export const regularSeasonStarted = cache(async () => {
  const { data } = await db().from("games").select("id").eq("season_type", 2).lte("start", new Date().toISOString()).limit(1);
  return !!data?.length;
});

export type BoxLine = {
  playerId: string; day: string; min: number; fgm: number; fga: number; reb: number; ast: number;
  stl: number; blk: number; tov: number; ej: number; pts: number; fpts: number;
};

// Every game each player has played this season, with the US date it was played on.
export async function boxLines(playerIds: string[]): Promise<BoxLine[]> {
  const [{ season }, regular] = await Promise.all([getSettings(), regularSeasonStarted()]);
  const seasonStart = `${season}-09-01`;
  const out: BoxLine[] = [];
  for (const ids of chunks([...new Set(playerIds)])) {
    const rows = await all((a, b) =>
      db().from("player_games").select("player_id, min, fgm, fga, reb, ast, stl, blk, tov, ej, pts, fpts, game:games(start, season_type)")
        .in("player_id", ids).eq("played", true).range(a, b),
    );
    for (const { player_id, game, ...r } of rows) {
      const day = etDay(game.start);
      if (regular && game.season_type === 1) continue; // preseason only counts until opening night
      if (day >= seasonStart) out.push({ ...r, playerId: player_id, day, fpts: Number(r.fpts) });
    }
  }
  return out;
}

// Box score lines for some players in some games only (e.g. one day's games): much lighter than a whole season.
export async function linesIn(playerIds: string[], gameIds: string[]): Promise<{ playerId: string; fpts: number }[]> {
  if (!playerIds.length || !gameIds.length) return [];
  const { data } = await db().from("player_games").select("player_id, fpts").in("player_id", [...new Set(playerIds)]).in("game_id", gameIds).eq("played", true);
  return (data ?? []).map((r) => ({ playerId: r.player_id, fpts: Number(r.fpts) }));
}
