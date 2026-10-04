import "server-only";
import { cache } from "react";
import { db } from "./supabase/server";
import { ROUND_SECONDS, SCORING, teamState, type Scoring, type Settings, type TeamState } from "./rules";
import type { Row } from "./supabase/types";
import type { SeasonLine } from "./espn-parse";
import { onIR } from "./lineup-store";

export type Team = Row<"teams">;

export type Player = Omit<Row<"players">, "updated_at" | "last_season" | "projection" | "nba_team_id"> & {
  nba_team_id?: string | null;
  last_season?: SeasonLine | null;
  projection?: SeasonLine | null;
};

// League settings (one row). Everything the commissioner can change lives here. Read once per page (cache).
export const getSettings = cache(async () => {
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
    waiverHours: s?.waiver_hours ?? 48, // how long a dropped player stays on waivers
    faLocked: s?.fa_locked ?? false, // free agency contract lengths locked by the commissioner
    roundSeconds: s?.round_seconds ?? ROUND_SECONDS, // free agency: how long each round's sealed bidding lasts
    scoring: { ...SCORING, ...(s?.scoring as Partial<Scoring> | null) } as Scoring,
    rules,
  };
});

export type TeamSummary = Team & { state: TeamState; capSpace: number; adjustments: number };

// Salary, roster size and contract slots used, for every team. Read once per page (cache).
export const teamSummaries = cache(async (): Promise<TeamSummary[]> => {
  const d = db();
  const [{ season, rules }, { data: teams }, { data: contracts }, { data: adj }, ir] = await Promise.all([
    getSettings(),
    d.from("teams").select("*").order("name"),
    d.from("contracts").select("team_id, player_id, salary, years, season_signed, active"),
    d.from("cap_adjustments").select("team_id, amount").eq("active", true),
    onIR(), // every team's IR, in the same wave
  ]);
  return (teams ?? []).map((t) => {
    const mine = (contracts ?? []).filter((c) => c.team_id === t.id);
    const adjustments = (adj ?? []).filter((a) => a.team_id === t.id).reduce((a, b) => a + Number(b.amount), 0);
    const state = teamState(t.id, mine, adjustments, season, ir);
    return { ...t, state, capSpace: rules.cap - state.salary, adjustments };
  });
});
