import "server-only";
import { redirect } from "next/navigation";
import { authClient, db } from "./supabase/server";
import { resolveRound, type Bid, type Settings, type TeamState } from "./rules";
import type { SeasonLine } from "./espn-parse";

export type Team = {
  id: string;
  name: string;
  manager_name: string | null;
  manager_email: string;
  user_id: string | null;
  is_commish: boolean;
};

export type Player = {
  id: string;
  name: string;
  position: string | null;
  nba_team: string | null;
  headshot: string | null;
  injury_status: string | null;
  injury_note: string | null;
  espn_salary: number | null;
  rank: number | null;
  nba_team_id?: string | null;
  last_season?: SeasonLine | null;
};

// Teams in the league. The first 8 people to sign up each get one.
export const LEAGUE_SIZE = 8;

export type Round = { id: string; season: number; number: number; status: string; closes_at: string | null };

export async function getSettings() {
  const { data } = await db().from("settings").select("*").eq("id", 1).single();
  const s = data ?? { season: 2026, cap: 150_000_000, roster_max: 13, min_salary: 1_000_000, league_name: "Legacy League" };
  const rules: Settings = {
    cap: Number(s.cap),
    rosterMax: s.roster_max,
    minSalary: Number(s.min_salary),
    slotLimits: { 4: 1, 3: 2, 2: 3 },
  };
  return { season: s.season as number, leagueName: s.league_name as string, rules };
}

// Who is using the app right now? Returns their team, or null.
export async function getMe(): Promise<{ email: string; team: Team | null } | null> {
  const user = (await testUser()) ?? (await (await authClient()).auth.getUser()).data.user;
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  const { data: team } = await db().from("teams").select("*").ilike("manager_email", email).maybeSingle();
  if (team && !team.user_id) await db().from("teams").update({ user_id: user.id }).eq("id", team.id);
  return { email, team: (team as Team) ?? null };
}

// Local testing only: pretend to be someone without email login. Never active on a real deployment.
export function testMode() {
  return !!process.env.LOCAL_TEST_EMAIL && (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").startsWith("http://localhost");
}
async function testUser() {
  if (!testMode()) return null;
  const { cookies } = await import("next/headers");
  const email = (await cookies()).get("test_as")?.value ?? process.env.LOCAL_TEST_EMAIL!;
  return { id: "00000000-0000-0000-0000-" + email.length.toString().padStart(12, "0"), email };
}

// For pages: signed in without a team yet -> pick a team name first.
export async function myTeamOrWelcome() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.team) redirect("/welcome");
  return me.team;
}

export async function requireTeam() {
  const me = await getMe();
  if (!me?.team) throw new Error("You don't have a team yet.");
  return me.team;
}

export async function requireCommish() {
  const team = await requireTeam();
  if (!team.is_commish) throw new Error("Commissioner only.");
  return team;
}

export type TeamSummary = Team & { state: TeamState; capSpace: number; adjustments: number };

// Salary, roster size and contract slots used, for every team.
export async function teamSummaries(): Promise<TeamSummary[]> {
  const { season, rules } = await getSettings();
  const d = db();
  const [{ data: teams }, { data: contracts }, { data: adj }] = await Promise.all([
    d.from("teams").select("*").order("name"),
    d.from("contracts").select("team_id, salary, years, season_signed, active"),
    d.from("cap_adjustments").select("team_id, amount").eq("active", true),
  ]);
  return (teams ?? []).map((t) => {
    const mine = (contracts ?? []).filter((c) => c.team_id === t.id);
    const active = mine.filter((c) => c.active);
    const adjustments = (adj ?? []).filter((a) => a.team_id === t.id).reduce((a, b) => a + Number(b.amount), 0);
    const salary = active.reduce((a, c) => a + Number(c.salary), 0) + adjustments;
    const slotsUsed: Record<number, number> = {};
    mine.filter((c) => c.season_signed === season).forEach((c) => (slotsUsed[c.years] = (slotsUsed[c.years] ?? 0) + 1));
    const state: TeamState = { id: t.id, salary, rosterCount: active.length, slotsUsed };
    return { ...(t as Team), state, capSpace: rules.cap - salary, adjustments };
  });
}

export async function latestRound(): Promise<Round | null> {
  const { season } = await getSettings();
  const { data } = await db()
    .from("rounds")
    .select("*")
    .eq("season", season)
    .neq("status", "setup")
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Round) ?? null;
}

export async function roundPlayers(roundId: string): Promise<Player[]> {
  const { data } = await db().from("round_players").select("player:players(*)").eq("round_id", roundId);
  return ((data ?? []) as unknown as { player: Player }[]).map((r) => r.player).sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
}

// Work out who wins each player in a round, applying every rule (cap, ties, slots, renounces).
export async function resolve(round: Round) {
  const { rules } = await getSettings();
  const d = db();
  const [players, teams, { data: bidRows }, { data: ren }] = await Promise.all([
    roundPlayers(round.id),
    teamSummaries(),
    d.from("bids").select("*").eq("round_id", round.id),
    d.from("renounces").select("bid_id, team_id").eq("round_id", round.id),
  ]);
  const bids: Bid[] = (bidRows ?? []).map((b) => ({
    id: b.id, teamId: b.team_id, playerId: b.player_id, amount: Number(b.amount), years: b.years, createdAt: b.created_at,
  }));
  const excluded = new Set((ren ?? []).map((r) => r.bid_id as string));
  const result = resolveRound(players.map((p) => p.id), bids, teams.map((t) => t.state), rules, excluded);
  return { players, teams, bids, result, renounced: excluded };
}

export async function log(kind: string, message: string) {
  await db().from("activity").insert({ kind, message });
}
