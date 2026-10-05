import "server-only";
import { db } from "./supabase/server";
import { fail, rpc } from "./db";
import { getSettings } from "./league";

// Rookie draft picks. Every team has one pick in each of the next DRAFTS drafts, starting with the draft held before
// the season in the league settings; a pick can be traded, so it has an original team and a holder.
export const DRAFTS = 5;

export type Pick = { id: string; year: number; team_id: string; original: { id: string; name: string } };

// "2027 pick", or "2027 pick (Spo's Spunkers)" when it began as another team's. Pure.
export const pickName = (p: Pick) => `${p.year} pick${p.original.id !== p.team_id ? ` (${p.original.name})` : ""}`;

const SELECT = "id, year, team_id, original:teams!draft_picks_original_team_fkey(id, name)";
type Raw = { id: string; year: number; team_id: string; original: { id: string; name: string } | null };
const clean = (rows: Raw[] | null): Pick[] =>
  (rows ?? []).map((r) => ({ id: r.id, year: r.year, team_id: r.team_id, original: r.original ?? { id: "", name: "?" } }))
    .sort((a, b) => a.year - b.year || a.original.name.localeCompare(b.original.name));

// The tradeable picks these teams hold (every team's when left out), earliest draft first. Picks are created the
// first time they're asked for, and topped up when a team joins or the season moves on.
export async function picksOf(teamIds?: string[]): Promise<Pick[]> {
  const { season } = await getSettings();
  // `again` asks in a slightly different way (sorted). While a page is being drawn, an identical request gets the
  // first one's answer back, so the read after creating picks would still come back short.
  const read = async (again = false) => {
    const q = db().from("draft_picks").select(SELECT).gte("year", season).lt("year", season + DRAFTS);
    const { data, error } = await (again ? q.order("year") : q);
    if (error) fail(error);
    return clean(data as Raw[] | null);
  };
  const [first, { count: teams }] = await Promise.all([read(), db().from("teams").select("id", { count: "exact", head: true })]);
  let all = first;
  if (all.length < (teams ?? 0) * DRAFTS) {
    await rpc("draft_picks_fill", { p_first: season, p_years: DRAFTS });
    all = await read(true);
  }
  // a pick already used in the rookie draft (lib/draft.ts) is no longer something to trade
  const { data: used } = await db().from("draft_picks").select("id").not("player_id", "is", null);
  const spent = new Set((used ?? []).map((p) => p.id));
  all = all.filter((p) => !spent.has(p.id));
  return teamIds ? all.filter((p) => teamIds.includes(p.team_id)) : all;
}

// Picks by id, whoever holds them now (an accepted offer's picks have moved).
export async function picksById(ids: string[]): Promise<Pick[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from("draft_picks").select(SELECT).in("id", ids);
  if (error) fail(error);
  return clean(data as Raw[] | null);
}
