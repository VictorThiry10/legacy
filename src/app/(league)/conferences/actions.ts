"use server";
import { requireTeam } from "@/lib/auth";
import { conferencesSeen } from "@/lib/conference-reveal";

// The conferences reveal was closed: it doesn't open again for this GM.
export async function sawConferences() {
  await conferencesSeen(await requireTeam());
}
