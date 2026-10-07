"use server";
import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { pickUp } from "@/lib/roster";
import { reservedForDraft } from "@/lib/draft";
import { placeBid, settleWaivers, withdrawBid } from "@/lib/waivers";
import { BID_STEP } from "@/lib/rules";

// Add a free agent (dropping someone if the roster is full), then go to my team.
export async function addPlayer(f: FormData) {
  const playerId = String(f.get("player_id") ?? "");
  const drop = String(f.get("drop") ?? "") || undefined;
  let err = "";
  try {
    const team = await requireTeam();
    await settleWaivers(); // a player whose waiver just ran out unclaimed is a free agent now
    if (await reservedForDraft(playerId).catch(() => false)) throw new Error("He's in the rookie draft: until it's over, he can only be drafted.");
    await pickUp({ teamId: team.id, playerId, dropContractId: drop });
  } catch (e) {
    err = e instanceof Error ? e.message : "Something went wrong.";
  }
  revalidatePath("/", "layout");
  if (err) redirect(`/players/${encodeURIComponent(playerId)}/add?err=${encodeURIComponent(err)}`, RedirectType.replace);
  redirect("/team", RedirectType.replace);
}

// Place, change or withdraw a sealed bid on a player on waivers, then back to the same page (it shows the bid).
async function onBid(f: FormData, fn: (teamId: string, playerId: string) => Promise<string>) {
  const playerId = String(f.get("player_id") ?? "");
  let err = "";
  try {
    const team = await requireTeam();
    await fn(team.id, playerId);
  } catch (e) {
    err = e instanceof Error ? e.message : "Something went wrong.";
  }
  revalidatePath("/", "layout");
  redirect(`/players/${encodeURIComponent(playerId)}/add${err ? `?err=${encodeURIComponent(err)}` : ""}`, RedirectType.replace);
}

export async function bid(f: FormData) {
  await onBid(f, (teamId, playerId) =>
    placeBid({
      teamId,
      playerId,
      amount: Number(f.get("amount")) * BID_STEP, // typed in $m, whole millions (placeBid refuses anything else)
      dropContractId: String(f.get("drop") ?? "") || undefined,
    }),
  );
}

export async function unbid(f: FormData) {
  await onBid(f, (teamId, playerId) => withdrawBid({ teamId, playerId }));
}
