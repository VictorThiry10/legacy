"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireTeam } from "@/lib/auth";
import { getSettings } from "@/lib/league";
import { gamesBetween } from "@/lib/nba";
import { rosters } from "@/lib/roster";
import { lineupFor, saveLineup } from "@/lib/lineup-store";
import { refreshScores } from "@/lib/season";
import { swap } from "@/lib/lineup";
import { quickLineup } from "@/lib/quick-lineup";
import { addDays, etDay, isDay, today } from "@/lib/dates";
import { guard, type ActionResult } from "@/lib/guard";

// Move a player into a slot (swapping with whoever is there) for one day. Later days follow until changed.
// The lineup on screen moves straight away; this checks and saves it. The live matchup catches up just after.
export async function moveSlot(day: string, playerId: string, to: string): Promise<ActionResult> {
  const result = await guard(async () => {
    const team = await requireTeam();
    if (!isDay(day)) throw new Error("Bad date.");
    if (day < today()) throw new Error("That day is over. Lineups can only change for today and later.");
    const [roster, games] = await Promise.all([rosters([team.id]), gamesBetween(day, day)]);
    const players = new Map(roster.map((p) => [p.id, p]));
    if (!players.has(playerId)) throw new Error("That player is not on your team.");
    const rows = await lineupFor(team.id, day, roster);
    const started = (id: string | null | undefined) => {
      const t = id ? players.get(id)?.nba_team_id : null;
      return !!t && games.some((g) => (g.home_team_id === t || g.away_team_id === t) && new Date(g.start) <= new Date());
    };
    if (started(playerId) || started(rows.find((r) => r.slot === to)?.playerId)) throw new Error("Locked: that player's game has started.");
    const next = swap(rows, playerId, to, players);
    if (typeof next === "string") throw new Error(next);
    // IR doesn't take a roster spot, so coming off it needs a free one.
    const irBefore = rows.find((r) => r.slot === "IR")?.playerId;
    const irAfter = next.find((r) => r.slot === "IR")?.playerId;
    const { rules } = await getSettings();
    if (irBefore && irBefore !== irAfter && roster.length - (irAfter ? 1 : 0) > rules.rosterMax) {
      throw new Error(`Your roster is full (${rules.rosterMax}): release a player before bringing ${players.get(irBefore)!.name} off IR.`);
    }
    await saveLineup(team.id, day, next);
    if (day === today()) after(() => refreshScores()); // live matchup shows the new lineup, without making this tap wait
  });
  revalidatePath("/", "layout");
  return result;
}

// Quick lineup (the button by the lineup): the best starters for each day from `from` to `to` (one day, or the rest
// of the matchup), by projected fantasy points per game (ESPN's projection, else last season). Players whose game
// has started and IR stay put. Each day gets its own save when something changes; later days follow the last one.
export async function setQuickLineup(from: string, to: string): Promise<ActionResult> {
  const result = await guard(async () => {
    const team = await requireTeam();
    if (!isDay(from) || !isDay(to) || to < from || addDays(from, 13) < to) throw new Error("Bad dates.");
    if (from < today()) throw new Error("That day is over. Lineups can only change for today and later.");
    const [roster, games] = await Promise.all([rosters([team.id]), gamesBetween(from, to)]);
    const players = new Map(roster.map((p) => [p.id, p]));
    const value = (id: string) => {
      const p = players.get(id);
      const s = p?.projection?.gp ? p.projection : p?.last_season?.gp ? p.last_season : null;
      return s ? s.fpts / s.gp : 0;
    };
    const now = Date.now();
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const todays = games.filter((g) => etDay(g.start) === day);
      const gameOf = (id: string) => {
        const t = players.get(id)?.nba_team_id;
        return t ? todays.find((g) => g.home_team_id === t || g.away_team_id === t) : undefined;
      };
      const rows = await lineupFor(team.id, day, roster);
      const next = quickLineup(rows, players, { value, plays: (id) => !!gameOf(id), locked: (id) => Date.parse(gameOf(id)?.start ?? "") <= now });
      if (next.every((r, i) => r.slot === rows[i]?.slot && r.playerId === rows[i]?.playerId)) continue; // as it was: no save, the day keeps following
      await saveLineup(team.id, day, next);
    }
    if (from === today()) after(() => refreshScores());
  });
  revalidatePath("/", "layout");
  return result;
}
