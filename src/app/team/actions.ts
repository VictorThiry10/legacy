"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { gamesBetween } from "@/lib/nba";
import { rosters } from "@/lib/roster";
import { lineupFor, saveLineup } from "@/lib/lineup-store";
import { refreshScores } from "@/lib/season";
import { swap } from "@/lib/lineup";
import { isDay, today } from "@/lib/dates";

// Move a player into a slot (swapping with whoever is there) for one day. Later days follow until changed.
export async function moveSlot(f: FormData) {
  const raw = String(f.get("back") ?? "");
  const back = raw.startsWith("/team") ? raw : "/team";
  let err = "";
  try {
    const team = await requireTeam();
    const day = String(f.get("day"));
    const playerId = String(f.get("player_id"));
    const to = String(f.get("to"));
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
    await saveLineup(team.id, day, next);
    if (day === today()) await refreshScores(); // live matchup shows the new lineup right away
  } catch (e) {
    err = e instanceof Error ? e.message : "Something went wrong.";
  }
  revalidatePath("/", "layout");
  const url = new URL(back, "http://x");
  url.searchParams.delete("move");
  if (err) url.searchParams.set("err", err);
  else url.searchParams.delete("err");
  redirect(url.pathname + url.search);
}
