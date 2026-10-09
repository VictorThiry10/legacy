import "server-only";
import { db } from "./supabase/server";
import { fail, rpc } from "./db";
import { getSettings } from "./league";
import { capSpaces, lockedToday, problemsFor, rosters } from "./roster";
import { onIR } from "./lineup-store";
import { BID_STEP, money, rankWaiverBids, addsLocked, ADDS_LOCKED } from "./rules";
import type { Row } from "./supabase/types";

// Waivers. Every dropped player sits on waivers for 48 hours (settings.waiver_hours). Meanwhile GMs send sealed
// bids: the salary they'd pay him on a 1 year contract. Nobody sees anyone else's bid, and the team that dropped him
// can't bid. When time is up the best bid that keeps its team legal signs him; with none he becomes a free agent,
// first come first served (roster.ts pickUp). Bids close on the database clock, so none can land late.

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
async function problemsWith(teamId: string, playerId: string, amount: number, drop: string | null) {
  const { season } = await getSettings();
  const mine = drop ? await rosters([teamId]) : [];
  const remove = drop && mine.some((p) => p.contract_id === drop) ? [drop] : [];
  return problemsFor([{ teamId, add: [{ player_id: playerId, salary: amount, years: 1, season_signed: season }], remove }]);
}

// Place or change my sealed bid. A full roster names who to drop, released only if the bid wins.
export async function placeBid(o: { teamId: string; playerId: string; amount: number; dropContractId?: string }) {
  if (addsLocked()) throw new Error(ADDS_LOCKED);
  const { rules } = await getSettings();
  const w = await openWaiver(o.playerId);
  if (!w) throw new Error("He is not on waivers anymore.");
  if (w.dropped_by === o.teamId) throw new Error("You dropped him, so you can't bid on him until he clears waivers.");
  if (!Number.isInteger(o.amount / BID_STEP)) throw new Error("Bids are in whole millions.");
  if (!(o.amount >= rules.minSalary)) throw new Error(`The lowest bid is ${money(lowestBid(rules.minSalary))}.`);
  const [mine, ir] = await Promise.all([rosters([o.teamId]), onIR([o.teamId])]);
  if (o.dropContractId && !mine.some((p) => p.contract_id === o.dropContractId)) throw new Error("That player is no longer on your team.");
  if (!o.dropContractId && mine.filter((p) => !ir.has(p.id)).length >= rules.rosterMax) {
    throw new Error(`Your roster is full (${rules.rosterMax}). Pick a player to drop if you win.`);
  }
  const problems = await problemsWith(o.teamId, o.playerId, o.amount, o.dropContractId ?? null);
  if (problems.length) throw new Error(`Not allowed: ${problems.join("; ")}.`);
  await rpc("waiver_bid", { p_waiver: w.id, p_team: o.teamId, p_amount: o.amount, p_drop: o.dropContractId ?? null });
  return `Bid in: ${money(o.amount)}.`;
}

export async function withdrawBid(o: { teamId: string; playerId: string }) {
  const w = await openWaiver(o.playerId);
  if (!w) throw new Error("He is not on waivers anymore.");
  await rpc("waiver_bid", { p_waiver: w.id, p_team: o.teamId, p_amount: null, p_drop: null });
  return "Bid withdrawn.";
}

// One waiver whose time is up: the best bid that keeps its team legal wins, checked against rosters as they are now.
async function settle(w: Waiver): Promise<"claimed" | "unclaimed" | "postponed"> {
  const { season, rules } = await getSettings();
  const { data, error } = await db().from("waiver_bids").select("*").eq("waiver_id", w.id);
  if (error) fail(error);
  const bids = data ?? [];
  const space = await capSpaces([...new Set(bids.map((b) => b.team_id))]);
  const ranked = rankWaiverBids(
    bids.map((b) => ({ ...b, teamId: b.team_id, amount: Number(b.amount), createdAt: b.created_at })),
    (t) => space.get(t) ?? 0,
    rules.minSalary,
  );
  let winner: (typeof ranked)[number] | null = null;
  for (const b of ranked) {
    if (!(await problemsWith(b.teamId, w.player_id, b.amount, b.drop_contract)).length) {
      winner = b;
      break;
    }
  }
  // The winner gives up a player who has played today: wait until tomorrow, so today's points stay as they are.
  const leaving = winner?.drop_contract ? (await rosters([winner.teamId])).find((p) => p.contract_id === winner.drop_contract) : undefined;
  if (leaving && (await lockedToday(leaving))) return "postponed";
  const count = `${bids.length} sealed bid${bids.length === 1 ? "" : "s"}`;
  const note = winner ? `Waiver claim, ${count}` : bids.length ? `Cleared waivers, no bid fit under the rules (${count})` : "Cleared waivers, no bids";
  await rpc("waiver_settle", { p_waiver: w.id, p_bid: winner?.id ?? null, p_bids: bids.length, p_season: season, p_note: note });
  return winner ? "claimed" : "unclaimed";
}

// Settle every waiver whose time is up, oldest first (an earlier claim counts against the cap for a later one).
// Safe to call from anywhere, any number of times at once: each waiver settles once and the others skip it.
export async function settleWaivers(): Promise<{ claimed: number; unclaimed: number; postponed: number }> {
  const { data: due, error } = await db().from("waivers").select("*").eq("status", "open").lte("closes_at", new Date().toISOString()).order("closes_at");
  if (error) fail(error);
  const out = { claimed: 0, unclaimed: 0, postponed: 0 };
  for (const w of due ?? []) {
    try {
      out[await settle(w)]++;
    } catch (e) {
      // settled by another request, our clock ahead of the database's, or a bid landed after we read them: next run
      if (!(e instanceof Error && /already settled|still open|just came in/i.test(e.message))) console.error(`waiver ${w.id}:`, e);
    }
  }
  return out;
}
