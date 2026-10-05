"use server";
import { requireTeam } from "@/lib/auth";
import { rookieClass } from "@/lib/espn";
import { getSettings } from "@/lib/league";
import { yearsLeft } from "@/lib/rules";
import { db } from "@/lib/supabase/server";
import { LENGTHS, ROOKIES, type DraftOptions } from "@/components/lottery/rookies";

// The rookie pick screen: every other rookie nobody has under contract (at the minimum salary), and the contract
// lengths my team has a slot for. The limits are free agency's (1 x 4 years, 2 x 3, 3 x 2): they count every
// active contract by the seasons it has left, this one included. 1 year is always open.
export async function draftOptions(): Promise<DraftOptions> {
  const team = await requireTeam();
  const [{ season, rules }, rookies, { data: mine }] = await Promise.all([
    getSettings(),
    rookieClass(),
    db().from("contracts").select("years, season_signed").eq("team_id", team.id).eq("active", true),
  ]);
  const priced = new Set(ROOKIES.map((r) => r.id));
  const rest = rookies.filter((r) => !priced.has(r.id));
  const { data: signed } = await db().from("contracts").select("player_id").eq("active", true).in("player_id", rest.map((r) => r.id));
  const gone = new Set((signed ?? []).map((c) => c.player_id));
  const held: Record<number, number> = {};
  for (const c of mine ?? []) held[yearsLeft(c, season)] = (held[yearsLeft(c, season)] ?? 0) + 1;
  return {
    others: rest
      .filter((r) => !gone.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, position: r.position ?? "", nba: r.nba_team, salary: rules.minSalary }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    open: LENGTHS.filter((len) => rules.slotLimits[len] === undefined || (held[len] ?? 0) < rules.slotLimits[len]),
  };
}
