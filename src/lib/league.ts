import "server-only";
import { db } from "./supabase/server";
import { SCORING, type Scoring, type Settings, type TeamState } from "./rules";
import type { Row } from "./supabase/types";
import type { SeasonLine } from "./espn-parse";

export type Team = Row<"teams">;

export type Player = Omit<Row<"players">, "updated_at" | "last_season" | "nba_team_id"> & {
  nba_team_id?: string | null;
  last_season?: SeasonLine | null;
};

// League settings (one row). Everything the commissioner can change lives here.
export async function getSettings() {
  const { data: s } = await db().from("settings").select("*").eq("id", 1).single();
  const rules: Settings = {
    cap: Number(s?.cap ?? 150_000_000),
    rosterMax: s?.roster_max ?? 13,
    minSalary: Number(s?.min_salary ?? 1_000_000),
    slotLimits: { 4: 1, 3: 2, 2: 3 },
  };
  return {
    season: s?.season ?? 2026,
    leagueName: s?.league_name ?? "Legacy League",
    leagueSize: s?.league_size ?? 8,
    scoring: { ...SCORING, ...(s?.scoring as Partial<Scoring> | null) } as Scoring,
    rules,
  };
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
    const adjustments = (adj ?? []).filter((a) => a.team_id === t.id).reduce((a, b) => a + Number(b.amount), 0);
    const state = teamState(t.id, mine, adjustments, season);
    return { ...t, state, capSpace: rules.cap - state.salary, adjustments };
  });
}

// A team's cap picture from its contracts (active ones count; this season's signings use contract slots).
export function teamState(
  id: string,
  contracts: { salary: number; years: number; season_signed: number; active: boolean }[],
  adjustments: number,
  season: number,
): TeamState {
  const active = contracts.filter((c) => c.active);
  const slotsUsed: Record<number, number> = {};
  contracts.filter((c) => c.season_signed === season).forEach((c) => (slotsUsed[c.years] = (slotsUsed[c.years] ?? 0) + 1));
  return { id, salary: active.reduce((a, c) => a + Number(c.salary), 0) + adjustments, rosterCount: active.length, slotsUsed };
}
