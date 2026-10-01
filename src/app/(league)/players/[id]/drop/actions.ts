"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { dropPlayer } from "@/lib/roster";

// Drop one of my players (he goes on waivers), then go to my team.
export async function drop(f: FormData) {
  const playerId = String(f.get("player_id") ?? "");
  let err = "";
  try {
    const team = await requireTeam();
    await dropPlayer({ teamId: team.id, contractId: String(f.get("contract_id") ?? "") });
  } catch (e) {
    err = e instanceof Error ? e.message : "Something went wrong.";
  }
  revalidatePath("/", "layout");
  if (err) redirect(`/players/${encodeURIComponent(playerId)}/drop?err=${encodeURIComponent(err)}`);
  redirect("/team");
}
