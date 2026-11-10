import "server-only";
import { db } from "./supabase/server";
import { fail, rpc } from "./db";
import { getSettings } from "./league";
import { ADDS_USED, HELD, NEXT_ADD_USED, addsThisWeek, capSpaces, lockedToday, nextWeekAdds, problemsFor, rosters } from "./roster";
import { onIR } from "./lineup-store";
import { BID_STEP, money, rankWaiverBids, addsLocked, addsLockedFor, addOffer, ADDS_LOCKED } from "./rules";
import { etDay, today } from "./dates";
import type { Row } from "./supabase/types";
import { announceDrop, announceSettled } from "./announce";

// Waivers. Every dropped player sits on waivers for 24 hours (settings.waiver_hours) and then until the next 8:00
// London, when all waivers clear (the database works out the time: waiver_closes_at). Meanwhile GMs send sealed
// bids: the salary they'd pay him on a 1 year contract. Nobody sees anyone else's bid, and the team that dropped him
// can't bid. When time is up the best bid that keeps its team legal signs him; with none he becomes a free agent,
// first come first served (roster.ts pickUp). Bids close on the database clock, so none can land late.
// Once the auction's last chance round has signed, every free agent goes on waivers for the same 24 hours and 8:00
// (bidding_settle): nobody dropped them, so every GM can bid, and the adds lock doesn't hold those bids.
// Next week's add, made early (rules.ts): on Sunday from the first tip-off a GM whose add is used can bid on a waiver
// (it clears on Monday or later, so the claim is next week's add), or hold a free agent (holdFreeAgent): he is that
// GM's alone, a waiver nobody else can bid on, and signs at the min salary when waivers clear on Monday at 8:00 London.

export type Waiver = Row<"waivers">;
export type WaiverBidRow = Row<"waiver_bids">;

// Bids are in whole millions, like free agency: the lowest is the min salary rounded up to a whole million.
export const lowestBid = (minSalary: number) => Math.ceil(minSalary / BID_STEP) * BID_STEP;

async function openWaiver(playerId: string): Promise<Waiver | null> {
  const { data, error } = await db().from("waivers").select("*").eq("player_id", playerId).eq("status", "open").maybeSingle();
  if (error) fail(error);
  return data;
}

// Settling from a page is a courtesy (the cron does it too): a failure there must never break the page.
const settleQuietly = () => settleWaivers().catch((e) => console.error("settleWaivers:", e));

// Players on waivers right now, by player id. Settles any whose time is up first, so pages never show a finished one.
export async function openWaivers(): Promise<Map<string, Waiver>> {
  await settleQuietly();
  const { data, error } = await db().from("waivers").select("*").eq("status", "open");
  if (error) fail(error);
  return new Map((data ?? []).map((w) => [w.player_id, w]));
}

// One player's open waiver and the viewer's own bid on it (never anyone else's: bids are sealed).
export async function waiverFor(playerId: string, teamId?: string): Promise<{ waiver: Waiver; myBid: WaiverBidRow | null } | null> {
  await settleQuietly();
  const waiver = await openWaiver(playerId);
  if (!waiver) return null;
  if (!teamId) return { waiver, myBid: null };
  const { data: myBid } = await db().from("waiver_bids").select("*").eq("waiver_id", waiver.id).eq("team_id", teamId).maybeSingle();
  return { waiver, myBid };
}

// What would break if this team signed him at this salary, after dropping the player its bid names (if still there)?
// With a waiver (settling it): the claim is an add today, so the week's add must still be there, not counting him.
async function problemsWith(teamId: string, playerId: string, amount: number, drop: string | null, settling?: Waiver) {
  const [{ season }, mine, adds] = await Promise.all([getSettings(), drop ? rosters([teamId]) : [], settling ? addsThisWeek(teamId, today(), settling.id) : null]);
  const remove = drop && mine.some((p) => p.contract_id === drop) ? [drop] : [];
  const problems = await problemsFor([{ teamId, add: [{ player_id: playerId, salary: amount, years: 1, season_signed: season }], remove }]);
  if (adds && adds.used >= adds.limit) problems.push(`this week's add is used (${adds.limit} per week)`); // the claim would be one more
  return problems;
}

// The add this team can make right now (rules.ts addOffer): this week's, or next week's once it has opened early.
// Throws when it has neither.
async function addOn(teamId: string) {
  const adds = await addsThisWeek(teamId);
  const next = await nextWeekAdds(teamId, adds);
  const offer = addOffer(adds, next);
  if (!offer) throw new Error(next ? NEXT_ADD_USED : ADDS_USED(adds));
  return { offer, adds };
}

// The roster side of an add, as the GM sent it: the player to drop is his, and a full roster names one.
async function dropFor(teamId: string, dropContractId: string | undefined, full: string) {
  const { rules } = await getSettings();
  const [mine, ir] = await Promise.all([rosters([teamId]), onIR([teamId])]);
  if (dropContractId && !mine.some((p) => p.contract_id === dropContractId)) throw new Error("That player is no longer on your team.");
  if (!dropContractId && mine.filter((p) => !ir.has(p.id)).length >= rules.rosterMax) throw new Error(`Your roster is full (${rules.rosterMax}). ${full}`);
}

// Place or change my sealed bid. A full roster names who to drop, released only if the bid wins.
export async function placeBid(o: { teamId: string; playerId: string; amount: number; dropContractId?: string }) {
  const { rules } = await getSettings();
  const w = await openWaiver(o.playerId);
  if (!w) throw new Error("He is not on waivers anymore.");
  if (addsLockedFor(w)) throw new Error(ADDS_LOCKED);
  if (w.held_for) throw new Error(HELD);
  const { offer, adds } = await addOn(o.teamId);
  // next week's add can only go on a claim that settles next week (on a Sunday evening every open waiver does)
  if (offer === "early" && etDay(w.closes_at) <= adds.ends) throw new Error(ADDS_USED(adds));
  if (w.dropped_by === o.teamId) throw new Error("You dropped him, so you can't bid on him until he clears waivers.");
  if (!Number.isInteger(o.amount / BID_STEP)) throw new Error("Bids are in whole millions.");
  if (!(o.amount >= rules.minSalary)) throw new Error(`The lowest bid is ${money(lowestBid(rules.minSalary))}.`);
  await dropFor(o.teamId, o.dropContractId, "Pick a player to drop if you win.");
  const problems = await problemsWith(o.teamId, o.playerId, o.amount, o.dropContractId ?? null);
  if (problems.length) throw new Error(`Not allowed: ${problems.join("; ")}.`);
  await rpc("waiver_bid", { p_waiver: w.id, p_team: o.teamId, p_amount: o.amount, p_drop: o.dropContractId ?? null });
  return `Bid in: ${money(o.amount)}.`;
}

export async function withdrawBid(o: { teamId: string; playerId: string }) {
  const w = await openWaiver(o.playerId);
  if (!w) throw new Error("He is not on waivers anymore.");
  if (w.held_for) throw new Error("There is no bid to withdraw.");
  await rpc("waiver_bid", { p_waiver: w.id, p_team: o.teamId, p_amount: null, p_drop: null });
  return "Bid withdrawn.";
}

// Next week's add, made early, on a free agent: he is held for this GM, first come first served, and signs for the
// min salary and 1 year when waivers clear (Monday 8:00 London). A full roster names who to drop, released only then.
export async function holdFreeAgent(o: { teamId: string; playerId: string; dropContractId?: string }) {
  if (addsLocked()) throw new Error(ADDS_LOCKED);
  const { offer, adds } = await addOn(o.teamId);
  if (offer !== "early") throw new Error("You still have this week's add.");
  const { season, rules } = await getSettings();
  const { data: taken } = await db().from("contracts").select("id").eq("player_id", o.playerId).eq("active", true).maybeSingle();
  if (taken) throw new Error("Someone just picked him up.");
  const w = await openWaiver(o.playerId);
  if (w) throw new Error(w.held_for ? HELD : "He is on waivers: place a bid instead.");
  await dropFor(o.teamId, o.dropContractId, "Pick a player to drop.");
  const problems = await problemsWith(o.teamId, o.playerId, rules.minSalary, o.dropContractId ?? null);
  if (problems.length) throw new Error(`Not allowed: ${problems.join("; ")}.`);
  try {
    await rpc("early_add", { p_team: o.teamId, p_player: o.playerId, p_amount: rules.minSalary, p_drop: o.dropContractId ?? null, p_season: season, p_week: adds.next });
  } catch (e) {
    // two GMs tapped at once: the database lets only one waiver per player be open
    if (e instanceof Error && /one_open_waiver_per_player|duplicate key/i.test(e.message)) throw new Error(HELD);
    throw e;
  }
  return "He's yours on Monday.";
}

// The GM gives up a free agent held for him: he is a free agent again, and next week's add is back.
export async function releaseHold(o: { teamId: string; playerId: string }) {
  const w = await openWaiver(o.playerId);
  if (!w || w.held_for !== o.teamId) throw new Error("Nothing to cancel.");
  await rpc("early_add_cancel", { p_waiver: w.id, p_team: o.teamId });
  return "Cancelled.";
}

// One waiver whose time is up: the best bid that keeps its team legal wins, checked against rosters as they are now.
async function settle(w: Waiver): Promise<"claimed" | "unclaimed" | "postponed"> {
  const { season, rules } = await getSettings();
  const { data, error } = await db().from("waiver_bids").select("*").eq("waiver_id", w.id);
  if (error) fail(error);
  const bids = (data ?? []).filter((b) => !w.held_for || b.team_id === w.held_for); // a held free agent is one GM's alone
  const space = await capSpaces([...new Set(bids.map((b) => b.team_id))]);
  const ranked = rankWaiverBids(
    bids.map((b) => ({ ...b, teamId: b.team_id, amount: Number(b.amount), createdAt: b.created_at })),
    (t) => space.get(t) ?? 0,
    rules.minSalary,
  );
  let winner: (typeof ranked)[number] | null = null;
  for (const b of ranked) {
    if (!(await problemsWith(b.teamId, w.player_id, b.amount, b.drop_contract, w)).length) {
      winner = b;
      break;
    }
  }
  // The winner gives up a player who has played today: wait until tomorrow, so today's points stay as they are.
  const leaving = winner?.drop_contract ? (await rosters([winner.teamId])).find((p) => p.contract_id === winner.drop_contract) : undefined;
  if (leaving && (await lockedToday(leaving))) return "postponed";
  const count = `${bids.length} sealed bid${bids.length === 1 ? "" : "s"}`;
  const note = w.held_for ? (winner ? "Free agent pickup, added early" : "Early add didn't fit under the rules")
    : winner ? `Waiver claim, ${count}` : bids.length ? `Cleared waivers, no bid fit under the rules (${count})` : "Cleared waivers, no bids";
  await rpc("waiver_settle", { p_waiver: w.id, p_bid: winner?.id ?? null, p_bids: data?.length ?? 0, p_season: season, p_note: note });
  // word to the GMs: the winner, the outbid, and everyone about the player the winner dropped to make room
  await announceSettled(w, winner ? { team_id: winner.teamId, amount: winner.amount } : null, [...new Set(bids.map((b) => b.team_id))]);
  if (winner && leaving) await announceDrop(leaving.id, winner.teamId);
  return winner ? "claimed" : "unclaimed";
}

// Settle every waiver whose time is up, oldest first (an earlier claim counts against the cap for a later one).
// Safe to call from anywhere, any number of times at once: each waiver settles once and the others skip it.
export async function settleWaivers(): Promise<{ claimed: number; unclaimed: number; postponed: number }> {
  const { data: due, error } = await db().from("waivers").select("*").eq("status", "open").lte("closes_at", new Date().toISOString()).order("closes_at");
  if (error) fail(error);
  const out = { claimed: 0, unclaimed: 0, postponed: 0 };
  if (!due?.length) return out;
  // The ones nobody bid on clear in one go (after the auction that is every free agent); the rest settle one by one.
  const { data: bidOn, error: e2 } = await db().from("waiver_bids").select("waiver_id, waivers!inner(status)").eq("waivers.status", "open");
  if (e2) fail(e2);
  const withBids = new Set((bidOn ?? []).map((b) => b.waiver_id));
  out.unclaimed += await rpc("waiver_clear", {});
  for (const w of due.filter((w) => withBids.has(w.id))) {
    try {
      out[await settle(w)]++;
    } catch (e) {
      // settled by another request, our clock ahead of the database's, or a bid landed after we read them: next run
      if (!(e instanceof Error && /already settled|still open|just came in/i.test(e.message))) console.error(`waiver ${w.id}:`, e);
    }
  }
  return out;
}
