"use server";
import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { guard, type ActionResult } from "@/lib/guard";
import { setWatched } from "@/lib/watchlist";

// The flag on a player's page: put him on my watch list, or take him off.
export async function watch(playerId: string, on: boolean): Promise<ActionResult> {
  return guard(async () => {
    await setWatched((await requireTeam()).id, playerId, on);
    revalidatePath("/players"); // the list behind may be showing my watch list
  });
}
