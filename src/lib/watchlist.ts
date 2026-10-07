import "server-only";
import { db } from "./supabase/server";
import { fail } from "./db";

// A GM's watch list: the players he flagged on their page, listed by the flag chip on the Players page.
export async function watchlist(teamId: string): Promise<Set<string>> {
  const { data, error } = await db().from("watchlist").select("player_id").eq("team_id", teamId).limit(2000);
  if (error) fail(error);
  return new Set((data ?? []).map((w) => w.player_id));
}

export async function isWatched(teamId: string, playerId: string) {
  const { data, error } = await db().from("watchlist").select("player_id").eq("team_id", teamId).eq("player_id", playerId).maybeSingle();
  if (error) fail(error);
  return !!data;
}

export async function setWatched(teamId: string, playerId: string, on: boolean) {
  const { error } = on
    ? await db().from("watchlist").upsert({ team_id: teamId, player_id: playerId }, { onConflict: "team_id,player_id", ignoreDuplicates: true })
    : await db().from("watchlist").delete().eq("team_id", teamId).eq("player_id", playerId);
  if (error) fail(error);
}
