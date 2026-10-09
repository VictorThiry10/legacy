"use server";
import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { guard, type ActionResult } from "@/lib/guard";
import { pickLengths } from "@/lib/pick-lengths";

// The "Assign contract length" pop-up: the lengths I chose for the players assigned to my team. Once.
export async function assignLengths(rows: { contractId: string; years: number }[]): Promise<ActionResult> {
  return guard(async () => {
    await pickLengths(await requireTeam(), rows);
    revalidatePath("/", "layout"); // contracts show on the team pages, the cap sheet, the player pages
  });
}
