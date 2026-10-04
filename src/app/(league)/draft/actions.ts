"use server";
import { requireTeam } from "@/lib/auth";
import { rookieClass } from "@/lib/espn";
import { getSettings, teamSummaries } from "@/lib/league";
import { db } from "@/lib/supabase/server";
import { ROOKIES, type DraftOptions } from "@/components/lottery/rookies";

// The rookie pick screen: every other rookie nobody has under contract (at the minimum salary), and the contract
// lengths my team can still sign this season (1 year is always open; longer ones have a few slots each).
export async function draftOptions(): Promise<DraftOptions> {
  const team = await requireTeam();
  const [{ rules }, teams, rookies] = await Promise.all([getSettings(), teamSummaries(), rookieClass()]);
  const priced = new Set(ROOKIES.map((r) => r.id));
  const rest = rookies.filter((r) => !priced.has(r.id));
  const { data: signed } = await db().from("contracts").select("player_id").eq("active", true).in("player_id", rest.map((r) => r.id));
  const gone = new Set((signed ?? []).map((c) => c.player_id));
  const used = teams.find((t) => t.id === team.id)?.state.slotsUsed ?? {};
  return {
    others: rest
      .filter((r) => !gone.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, position: r.position ?? "", nba: r.nba_team, salary: rules.minSalary }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    years: [1, ...Object.keys(rules.slotLimits).map(Number)].filter((len) => len === 1 || (used[len] ?? 0) < rules.slotLimits[len]).sort((a, b) => a - b),
  };
}
