import "server-only";
import { db } from "./supabase/server";
import { notifyTeams } from "./push";
import { money } from "./rules";
import { londonTime } from "./dates";

// Pushes about waivers: a player dropped, a claim settled. Like every push, a nice-to-have: nothing here ever throws
// into the move that triggered it.

const quietly = (fn: () => Promise<unknown>) => fn().catch((e) => console.error("announce:", e));

async function names(playerId: string, teamIds: string[]) {
  const [{ data: p }, { data: teams }] = await Promise.all([
    db().from("players").select("name").eq("id", playerId).maybeSingle(),
    db().from("teams").select("id, name"),
  ]);
  const team = (id: string | null | undefined) => teams?.find((t) => t.id === id)?.name ?? "A GM";
  return { player: p?.name ?? "A player", team, others: (teams ?? []).map((t) => t.id).filter((id) => !teamIds.includes(id)) };
}

// He's on waivers: every other GM hears, with the time bids close (the league's clock, London).
export const announceDrop = (playerId: string, byTeamId: string) => quietly(async () => {
  const [{ player, team, others }, { data: w }] = await Promise.all([
    names(playerId, [byTeamId]),
    db().from("waivers").select("id, closes_at").eq("player_id", playerId).eq("status", "open").maybeSingle(),
  ]);
  if (!w) return;
  await notifyTeams(others, { title: `${player} on waivers`, body: `Dropped by ${team(byTeamId)} · bids until ${londonTime(w.closes_at)}`, url: `/players/${playerId}`, tag: `waiver-${w.id}` });
});

// The waiver settled: the winner hears he has him, the GMs he outbid hear who got him and for how much (the salary is
// in the moves log anyway), and when no bid fit the rules the bidders hear he's a free agent now.
export const announceSettled = (w: { id: string; player_id: string }, winner: { team_id: string; amount: number } | null, bidders: string[]) => quietly(async () => {
  if (!bidders.length) return;
  const { player, team } = await names(w.player_id, []);
  const url = `/players/${w.player_id}`, tag = `waiver-${w.id}`;
  if (!winner) return void (await notifyTeams(bidders, { title: `${player} cleared waivers`, body: "No bid fit under the rules. Free agent now.", url, tag }));
  await notifyTeams([winner.team_id], { title: `${player} is yours`, body: `Waiver claim · ${money(winner.amount)}, 1 year`, url, tag });
  await notifyTeams(bidders.filter((t) => t !== winner.team_id), { title: `${player} went to ${team(winner.team_id)}`, body: `Outbid · ${money(winner.amount)}`, url, tag });
});
