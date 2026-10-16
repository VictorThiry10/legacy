"use server";
import { requireTeam } from "@/lib/auth";
import { scheduleSeen } from "@/lib/schedule-release";

// The schedule release show was closed: it doesn't open again for this GM.
export async function sawSchedule() {
  await scheduleSeen(await requireTeam());
}
