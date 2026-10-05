"use server";
import { requireTeam } from "@/lib/auth";
import { draftBoard, draftOptions, lotteryWatched, pickRookie, playLottery, type DraftBoard, type DraftOptions } from "@/lib/draft";
import { guard, type ActionResult } from "@/lib/guard";

// The lottery pop-up's Play: the saved draft order, original teams, #1 first (drawn now if nobody has yet).
export async function playRookieLottery(): Promise<{ order: string[] } | { error: string }> {
  try {
    await requireTeam();
    return { order: await playLottery() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

// The show is over for this GM: his pop-up doesn't open again. Says whether he is on the clock.
export async function watchedRookieLottery(): Promise<{ myTurn: boolean }> {
  const team = await requireTeam();
  await lotteryWatched(team);
  return { myTurn: (await draftBoard(team)).myTurn };
}

// The pick screen: where the draft stands, the rest of the rookie class, the contract lengths I can still sign.
export async function rookieDraft(): Promise<DraftBoard & DraftOptions> {
  const team = await requireTeam();
  const [board, options] = await Promise.all([draftBoard(team), draftOptions(team)]);
  return { ...board, ...options };
}

// Make my pick.
export async function draftRookie(playerId: string, years: number): Promise<ActionResult> {
  return guard(async () => pickRookie(await requireTeam(), playerId, years));
}
