"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase/server";
import { getSettings, log, requireTeam, resolve, type Round } from "@/lib/league";
import { canRenounce, money, renounceBlock } from "@/lib/rules";
import { guard } from "@/lib/guard";

async function openRound(roundId: string) {
  const { data } = await db().from("rounds").select("*").eq("id", roundId).single();
  const r = data as Round | null;
  if (!r || r.status !== "open") throw new Error("This round is not open for bids.");
  if (r.closes_at && new Date(r.closes_at) < new Date()) throw new Error("Bidding for this round has closed.");
  return r;
}

export async function placeBid(form: FormData) {
  return guard(async () => {
  const team = await requireTeam();
  const roundId = String(form.get("round_id"));
  const playerId = String(form.get("player_id"));
  const amountM = Number(form.get("amount"));
  const years = Number(form.get("years"));
  await openRound(roundId);
  const { rules } = await getSettings();
  if (!Number.isFinite(amountM) || amountM * 1e6 < rules.minSalary) throw new Error(`Minimum bid is ${money(rules.minSalary)}.`);
  if (![1, 2, 3, 4].includes(years)) throw new Error("Contract must be 1 to 4 years.");
  const { data: inRound } = await db().from("round_players").select("player_id").eq("round_id", roundId).eq("player_id", playerId).maybeSingle();
  if (!inRound) throw new Error("That player is not in this round.");
  const amount = Math.round(amountM * 10) * 100_000; // round to $0.1m
  const { error } = await db().from("bids").upsert(
    { round_id: roundId, team_id: team.id, player_id: playerId, amount, years, created_at: new Date().toISOString() },
    { onConflict: "round_id,team_id,player_id" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/draft");
  });
}

export async function removeBid(form: FormData) {
  return guard(async () => {
  const team = await requireTeam();
  const roundId = String(form.get("round_id"));
  await openRound(roundId);
  await db().from("bids").delete().eq("round_id", roundId).eq("team_id", team.id).eq("player_id", String(form.get("player_id")));
  revalidatePath("/draft");
  });
}

export async function renounce(form: FormData) {
  return guard(async () => {
  const team = await requireTeam();
  const roundId = String(form.get("round_id"));
  const bidId = String(form.get("bid_id"));
  const { data: round } = await db().from("rounds").select("*").eq("id", roundId).single();
  if (!round || round.status !== "revealed") throw new Error("You can only renounce while results are showing, before the commissioner finalizes.");
  const { result } = await resolve(round as Round);
  const award = result.awards.find((a) => a.bidId === bidId && a.teamId === team.id);
  if (!award) throw new Error("That is not one of your winning bids.");
  const { data: used } = await db().from("renounces").select("block").eq("team_id", team.id).eq("season", round.season);
  if (!canRenounce(round.number, (used ?? []).map((u) => u.block))) throw new Error("You already used your Renounce Right for this block of rounds.");
  const { error } = await db().from("renounces").insert({
    season: round.season, block: renounceBlock(round.number), team_id: team.id, round_id: roundId, bid_id: bidId,
  });
  if (error) throw new Error(error.message);
  await log("renounce", `${team.name} renounced a player in round ${round.number}`);
  revalidatePath("/draft");
  });
}
