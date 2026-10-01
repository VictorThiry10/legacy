"use server";
import { requireTeam } from "@/lib/auth";
import { extend } from "@/lib/extensions";
import { guard, type ActionResult } from "@/lib/guard";

// The extensions pop-up: sign the ticked players (or none), once. The pop-up refreshes the page when it closes.
export async function decideExtensions(playerIds: string[]): Promise<ActionResult> {
  return guard(async () => extend(await requireTeam(), playerIds));
}
