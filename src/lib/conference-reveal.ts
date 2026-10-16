import "server-only";
import { db } from "./supabase/server";
import { CONFERENCES, isConference, REVEAL_TEST_ONLY, type Conference } from "./conferences";
import { fail } from "./db";
import { getSettings, type Team } from "./league";
import { gm } from "./lottery";
import type { Look } from "./team-look";

// The conferences reveal: a show that opens over the app once per GM (components/conferences/Reveal.tsx), after
// the schedule release, and never again once closed.

export type RevealTeam = Look & { id: string; gm: string };
export type ConferenceReveal = Record<Conference, { name: string; teams: RevealTeam[] }>;

// What this GM's reveal shows, or null: not open to him yet, already seen, or the schedule release comes first.
export async function conferenceReveal(team: Team): Promise<ConferenceReveal | null> {
  if (REVEAL_TEST_ONLY.length && !REVEAL_TEST_ONLY.includes(team.id)) return null;
  const { season } = await getSettings();
  const [{ data: teams, error }, { data: seen }, { data: schedule }] = await Promise.all([
    db().from("teams").select("id, name, logo_url, color, conference").order("created_at"),
    db().from("conference_views").select("team_id").eq("season", season).eq("team_id", team.id).maybeSingle(),
    db().from("schedule_views").select("team_id").eq("season", season).eq("team_id", team.id).maybeSingle(),
  ]);
  if (error) fail(error);
  if (seen || !schedule) return null;
  const side = (c: Conference) => ({
    name: CONFERENCES[c],
    teams: (teams ?? []).filter((t) => t.conference === c).map((t) => ({ id: t.id, name: t.name, logo_url: t.logo_url, color: t.color, gm: gm(t.id).name })),
  });
  const out = { paris: side("paris"), london: side("london") };
  if (!out.paris.teams.length || !out.london.teams.length || !(teams ?? []).every((t) => isConference(t.conference))) return null;
  return out;
}

// The GM has seen the reveal: it doesn't open again.
export async function conferencesSeen(team: Team) {
  const { season } = await getSettings();
  const { error } = await db().from("conference_views").upsert({ season, team_id: team.id }, { onConflict: "season,team_id", ignoreDuplicates: true });
  if (error) fail(error);
}
