"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { pickUp } from "@/lib/roster";

// Add a free agent (dropping someone if the roster is full), then go to my team.
export async function addPlayer(f: FormData) {
  const playerId = String(f.get("player_id") ?? "");
  const drop = String(f.get("drop") ?? "") || undefined;
  let err = "";
  try {
    const team = await requireTeam();
    await pickUp({ teamId: team.id, playerId, dropContractId: drop });
  } catch (e) {
    err = e instanceof Error ? e.message : "Something went wrong.";
  }
  revalidatePath("/", "layout");
  if (err) redirect(`/players/${encodeURIComponent(playerId)}/add?err=${encodeURIComponent(err)}`);
  redirect("/team");
}
