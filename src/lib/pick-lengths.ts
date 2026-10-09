import "server-only";
import { db } from "./supabase/server";
import { fail, rpc } from "./db";
import { cardOf, type CardPlayer } from "./bidding";
import { getSettings, type Team } from "./league";
import { yearsLeft } from "./rules";

// Contract lengths a GM still has to choose: players the commissioner assigned to his team at a set salary (a new
// GM's first players). He picks 1 to 4 years for each, once, within the same limits as after free agency (1 x 4
// years, 2 x 3, 3 x 2: every active contract counts by the seasons it has left).

export type LengthDeal = { contractId: string; salary: number; years: number; player: CardPlayer };
export type LengthChoice = {
  deals: LengthDeal[]; // the contracts to choose a length for
  held: LengthDeal[]; // his other contracts with 2+ seasons left (years: seasons left): they use the same slots
  limits: Record<number, number>; // years -> how many a team can have
};

// What the Team page's "Assign contract length" row opens, or null when there is nothing to choose.
export async function lengthChoice(team: Team): Promise<LengthChoice | null> {
  const [{ season, rules }, { data, error }] = await Promise.all([
    getSettings(),
    db().from("contracts").select("id, salary, years, season_signed, pick_length, player:players(*)").eq("team_id", team.id).eq("active", true),
  ]);
  if (error) fail(error);
  const rows = (data ?? []).flatMap((c) => (c.player ? [{ c, player: cardOf(c.player) }] : []));
  const deals = rows.filter((r) => r.c.pick_length).map((r) => ({ contractId: r.c.id, salary: Number(r.c.salary), years: r.c.years, player: r.player }));
  if (!deals.length) return null;
  const held = rows
    .filter((r) => !r.c.pick_length && yearsLeft(r.c, season) >= 2)
    .map((r) => ({ contractId: r.c.id, salary: Number(r.c.salary), years: yearsLeft(r.c, season), player: r.player }));
  const bySalary = (a: LengthDeal, b: LengthDeal) => b.salary - a.salary;
  return { deals: deals.sort(bySalary), held: held.sort((a, b) => b.years - a.years || bySalary(a, b)), limits: rules.slotLimits };
}

// Save the lengths: every pending contract of the team at once. The database checks the limits again.
export async function pickLengths(team: Team, rows: { contractId: string; years: number }[]) {
  const { season, rules } = await getSettings();
  await rpc("contracts_pick_lengths", {
    p_team: team.id, p_season: season, p_rows: rows.map((r) => ({ contract_id: r.contractId, years: r.years })), p_limits: rules.slotLimits,
  });
}
