"use server";
import { revalidatePath } from "next/cache";
import { getMe } from "@/lib/auth";
import { markMovesSeen } from "@/lib/roster";

// I've opened the moves log (MarkSeen on /league/moves): no red dot until the next move.
export async function seen() {
  const me = await getMe();
  if (!me?.team) return;
  await markMovesSeen(me.team.id).catch(() => {});
  revalidatePath("/", "layout"); // the Team page's row and the Intel list are drawn fresh
}
