import "server-only";
import { db } from "./supabase/server";
import { fail } from "./db";
import { monthDay } from "./dates";
import { lotteryPrompt } from "./draft";
import { getSettings, type Team } from "./league";
import { seasonLabel } from "./player-stats";
import { matchups } from "./season";
import type { Look } from "./team-look";

// The schedule release: a show that opens over the app the first time each GM comes in after the real schedule is
// built (components/schedule/Release.tsx), and never again once he has closed it.

export type ReleaseGame = { week: number; starts: string; dates: string; home: boolean; opponent: Look };
export type ReleaseRound = { name: string; dates: string; note: string };
export type Release = { season: string; me: Look; games: ReleaseGame[]; rounds: ReleaseRound[]; weeks: number; teams: number };

// What this GM's show says, or null: no real schedule yet, already seen, or the lottery show comes first.
export async function scheduleRelease(team: Team): Promise<Release | null> {
  const { season } = await getSettings();
  const [ms, lottery, { data: teams }, { data: seen, error }] = await Promise.all([
    matchups(),
    lotteryPrompt(team),
    db().from("teams").select("id, name, logo_url, color"),
    db().from("schedule_views").select("team_id").eq("season", season).eq("team_id", team.id).maybeSingle(),
  ]);
  if (error) fail(error);
  if (seen || lottery) return null;
  const real = ms.filter((m) => !m.is_test);
  const mine = real.filter((m) => m.round === "regular" && (m.home_team_id === team.id || m.away_team_id === team.id)).sort((a, b) => a.week - b.week);
  if (!mine.length) return null;
  const look = (id: string | null): Look => {
    const t = (teams ?? []).find((x) => x.id === id);
    return t ? { name: t.name, logo_url: t.logo_url, color: t.color } : { name: "?" };
  };
  const span = (m: { starts: string; ends: string }) => `${monthDay(m.starts)} to ${monthDay(m.ends)}`;
  const semi = real.find((m) => m.round === "semi");
  const final = real.find((m) => m.round === "final");
  return {
    season: seasonLabel(season + 1),
    me: look(team.id),
    games: mine.map((m) => {
      const home = m.home_team_id === team.id;
      return { week: m.week, starts: monthDay(m.starts), dates: span(m), home, opponent: look(home ? m.away_team_id : m.home_team_id) };
    }),
    rounds: [
      ...(semi ? [{ name: "Semifinals", dates: span(semi), note: "1st vs 4th · 2nd vs 3rd" }] : []),
      ...(final ? [{ name: "Final", dates: span(final), note: "The semifinal winners" }] : []),
    ],
    weeks: new Set(real.filter((m) => m.round === "regular").map((m) => m.week)).size,
    teams: (teams ?? []).length,
  };
}

// The GM has seen the show: it doesn't open again.
export async function scheduleSeen(team: Team) {
  const { season } = await getSettings();
  const { error } = await db().from("schedule_views").upsert({ season, team_id: team.id }, { onConflict: "season,team_id", ignoreDuplicates: true });
  if (error) fail(error);
}
