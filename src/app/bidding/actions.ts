"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guard, type ActionResult } from "@/lib/guard";
import * as B from "@/lib/bidding";

// Everything the bidding site can do. Each action checks who is signed in, then refreshes the room.

async function me() {
  const team = await B.bidTeam();
  if (!team) throw new Error("Sign in first.");
  return team;
}

const run = (fn: () => Promise<unknown>) =>
  guard(async () => {
    await fn();
    revalidatePath("/bidding", "layout");
  });

export async function signIn(_: ActionResult, f: FormData): Promise<ActionResult> {
  const r = await guard(() => B.signIn(String(f.get("email") ?? "")));
  if (r?.error) return r;
  redirect("/bidding");
}

export async function signOut() {
  await B.signOut();
  redirect("/bidding");
}

// amount in $m (whole millions), or null to take the bid back
export async function bid(roundId: string, playerId: string, amountM: number | null) {
  return run(async () => B.placeBid(await me(), roundId, playerId, amountM === null ? null : Math.round(amountM * 1_000_000)));
}

export async function renounce(bidId: string) {
  return run(async () => B.renounce(await me(), bidId));
}

export async function setLengths(rows: { contractId: string; years: number }[]) {
  return run(async () => B.setLengths(await me(), rows));
}

// The schedule (Rounds page): when the next round opens (ISO time, worked out in the commissioner's own time zone
// by the form) and how long everything lasts, in minutes. null clears it: nothing opens until a new one is set.
export async function setSchedule(plan: { start: string; bidMinutes: number; renounceMinutes: number; everyMinutes: number } | null) {
  return run(async () => B.setSchedule(await me(), plan));
}

export async function lockContracts(locked: boolean) {
  return run(async () => B.lockContracts(await me(), locked));
}

export async function restart() {
  return run(async () => B.restart(await me()));
}

// setup page (forms)
export async function addToRound(f: FormData) {
  return run(async () => B.addToRound(await me(), Number(f.get("round")), String(f.get("player"))));
}

export async function removeFromRound(f: FormData) {
  return run(async () => B.removeFromRound(await me(), Number(f.get("round")), String(f.get("player"))));
}

export async function autoFill() {
  return run(async () => B.autoFill(await me()));
}

export async function addTeam(f: FormData) {
  return run(async () => B.addTeam(await me(), String(f.get("name") ?? ""), String(f.get("manager") ?? ""), String(f.get("email") ?? "")));
}
