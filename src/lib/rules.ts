// Core league rules. Pure functions: no database, easy to test.

export type Settings = {
  cap: number; // hard salary cap per team, in dollars
  rosterMax: number; // max players per roster
  minSalary: number; // cost to fill one open roster spot
  slotLimits: Record<number, number>; // contract length -> max signings per season
};

export const DEFAULT_SETTINGS: Settings = {
  cap: 150_000_000,
  rosterMax: 13,
  minSalary: 1_000_000,
  slotLimits: { 4: 1, 3: 2, 2: 3 },
};

export type TeamState = {
  id: string;
  salary: number; // committed salary incl. cap adjustments (injury relief is negative)
  rosterCount: number;
  slotsUsed: Record<number, number>; // contract length -> signings this season
};

export type Bid = {
  id: string;
  teamId: string;
  playerId: string;
  amount: number;
  years: number;
  createdAt: string; // ISO
};

export type Award = {
  playerId: string;
  teamId: string;
  amount: number;
  years: number;
  bidId: string;
  tie?: boolean; // true when amount AND cap space were tied: settle by rock paper scissors
};

export type Resolution = {
  awards: Award[];
  unsold: string[]; // players with no valid bid, go to the 13th round / waivers
  voided: { bidId: string; reason: string }[];
};

export function capSpace(t: TeamState, s: Settings) {
  return s.cap - t.salary;
}

// Is a team still legal after taking the extra awards?
function feasible(t: TeamState, extra: Award[], s: Settings): string | null {
  const salary = t.salary + extra.reduce((a, b) => a + b.amount, 0);
  const roster = t.rosterCount + extra.length;
  if (roster > s.rosterMax) return "roster_full";
  const openSpots = s.rosterMax - roster;
  if (salary + openSpots * s.minSalary > s.cap) return "over_cap";
  for (const [len, max] of Object.entries(s.slotLimits)) {
    const n = (t.slotsUsed[+len] ?? 0) + extra.filter((a) => a.years === +len).length;
    if (n > max) return `no_${len}yr_slot`;
  }
  return null;
}

/**
 * Resolve a sealed bid round.
 * 1. Each player goes to the highest bid. Ties: most cap space wins; if still tied, flag for rock paper scissors.
 * 2. If a team ends up illegal (over cap, roster full, no contract slot), its most recent winning bid
 *    is voided and that player goes to the next highest bidder. Repeat until everyone is legal.
 * `excluded` holds bid ids to ignore (renounced bids).
 */
export function resolveRound(
  playerIds: string[],
  bids: Bid[],
  teams: TeamState[],
  s: Settings = DEFAULT_SETTINGS,
  excluded: Set<string> = new Set(),
): Resolution {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const voided: Resolution["voided"] = [];
  const dead = new Set(excluded);

  const ranked = (pid: string) =>
    bids
      .filter((b) => b.playerId === pid && !dead.has(b.id) && teamById.has(b.teamId) && b.amount >= s.minSalary)
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        const sa = capSpace(teamById.get(a.teamId)!, s);
        const sb = capSpace(teamById.get(b.teamId)!, s);
        if (sb !== sa) return sb - sa;
        return a.createdAt.localeCompare(b.createdAt);
      });

  for (let guard = 0; guard < 1000; guard++) {
    // tentative awards
    const awards: Award[] = [];
    for (const pid of playerIds) {
      const list = ranked(pid);
      if (!list.length) continue;
      const top = list[0];
      const second = list[1];
      const tie =
        !!second &&
        second.amount === top.amount &&
        capSpace(teamById.get(second.teamId)!, s) === capSpace(teamById.get(top.teamId)!, s);
      awards.push({ playerId: pid, teamId: top.teamId, amount: top.amount, years: top.years, bidId: top.id, tie });
    }

    // find the first illegal team, void its most recent winning bid
    let changed = false;
    for (const t of teams) {
      const mine = awards.filter((a) => a.teamId === t.id);
      if (!mine.length) continue;
      const problem = feasible(t, mine, s);
      if (!problem) continue;
      const bidOf = (a: Award) => bids.find((b) => b.id === a.bidId)!;
      const latest = mine.reduce((x, y) => (bidOf(y).createdAt > bidOf(x).createdAt ? y : x));
      dead.add(latest.bidId);
      voided.push({ bidId: latest.bidId, reason: problem });
      changed = true;
      break;
    }
    if (!changed) {
      const sold = new Set(awards.map((a) => a.playerId));
      return { awards, unsold: playerIds.filter((p) => !sold.has(p)), voided };
    }
  }
  throw new Error("resolveRound did not settle");
}

// Renounce Rights: 3 per season, one per block of 4 rounds (rounds 1-4, 5-8, 9-12).
export function renounceBlock(roundNumber: number) {
  return Math.min(2, Math.floor((Math.max(1, roundNumber) - 1) / 4));
}

export function canRenounce(roundNumber: number, usedBlocks: number[]) {
  return !usedBlocks.includes(renounceBlock(roundNumber));
}

// Rookie lottery odds for the #1 pick. Input: team ids ordered worst to best.
export function lotteryOdds(worstToBest: string[]): Record<string, number> {
  const bottom = [25, 20, 15, 10];
  const odds: Record<string, number> = {};
  const n = worstToBest.length;
  const topShare = n > 4 ? (100 - bottom.reduce((a, b) => a + b, 0)) / (n - 4) : 0;
  worstToBest.forEach((id, i) => (odds[id] = i < 4 ? bottom[i] : topShare));
  return odds;
}

// Draw the full order: pick #1 by odds, then repeat with remaining teams (odds renormalised).
export function drawLottery(worstToBest: string[], rand: () => number = Math.random): string[] {
  const odds = lotteryOdds(worstToBest);
  const left = [...worstToBest];
  const order: string[] = [];
  while (left.length) {
    const total = left.reduce((a, id) => a + odds[id], 0);
    let r = rand() * total;
    let pick = left[left.length - 1];
    for (const id of left) {
      r -= odds[id];
      if (r < 0) {
        pick = id;
        break;
      }
    }
    order.push(pick);
    left.splice(left.indexOf(pick), 1);
  }
  return order;
}

// Fantasy points from one box score line.
export type StatLine = {
  pts: number; fgm: number; fga: number; reb: number; ast: number; stl: number; blk: number;
  to: number; tf: number; ej: number; win: number;
};

export type Scoring = { pts: number; fgm: number; fgmi: number; reb: number; ast: number; stl: number; blk: number; to: number; tf: number; ej: number; win: number };

// Default weights. The league's live weights are in settings.scoring (editable on the Settings page).
export const SCORING: Scoring = { pts: 1, fgm: 1, fgmi: -1, reb: 1, ast: 1.5, stl: 2.5, blk: 2.5, to: -1.5, tf: -1, ej: -2, win: 1 };

export function fantasyPoints(l: StatLine, w: Scoring = SCORING): number {
  const p =
    l.pts * w.pts +
    l.fgm * w.fgm +
    (l.fga - l.fgm) * w.fgmi +
    l.reb * w.reb +
    l.ast * w.ast +
    l.stl * w.stl +
    l.blk * w.blk +
    l.to * w.to +
    l.tf * w.tf +
    l.ej * w.ej +
    l.win * w.win;
  return Math.round(p * 10) / 10;
}

// A team's cap picture from its contracts. Every active contract counts against the cap; a player on IR
// doesn't take a roster spot; this season's signings use contract-length slots.
export function teamState(
  id: string,
  contracts: { player_id?: string; salary: number; years: number; season_signed: number; active: boolean }[],
  adjustments: number,
  season: number,
  ir: Set<string> = new Set(),
): TeamState {
  const active = contracts.filter((c) => c.active);
  const slotsUsed: Record<number, number> = {};
  contracts.filter((c) => c.season_signed === season).forEach((c) => (slotsUsed[c.years] = (slotsUsed[c.years] ?? 0) + 1));
  const rosterCount = active.filter((c) => !c.player_id || !ir.has(c.player_id)).length;
  return { id, salary: active.reduce((a, c) => a + Number(c.salary), 0) + adjustments, rosterCount, slotsUsed };
}

// Is a team legal after a roster move? Hard cap, roster size, and contract-length slots for this season's signings.
export function rosterProblems(t: TeamState, s: Settings): string[] {
  const out: string[] = [];
  if (t.salary > s.cap) out.push(`over the ${money(s.cap)} cap by ${money(t.salary - s.cap)}`);
  if (t.rosterCount > s.rosterMax) out.push(`${t.rosterCount} players, max is ${s.rosterMax}`);
  for (const [len, max] of Object.entries(s.slotLimits)) {
    const n = t.slotsUsed[+len] ?? 0;
    if (n > max) out.push(`${n} ${len}-year contracts signed this season, max is ${max}`);
  }
  return out;
}

export function money(n: number) {
  const m = n / 1_000_000;
  return `$${Number.isInteger(m) ? m : m.toFixed(1)}m`;
}

// Waivers: a dropped player's sealed bids, best first. Highest amount wins; a tie goes to the team with more
// cap space, then to the earlier bid. Bids under the minimum salary don't count.
export type WaiverBid = { id: string; teamId: string; amount: number; createdAt: string };

export function rankWaiverBids<B extends WaiverBid>(bids: B[], capSpace: (teamId: string) => number, minSalary: number): B[] {
  return bids
    .filter((b) => b.amount >= minSalary)
    .sort((a, b) => b.amount - a.amount || capSpace(b.teamId) - capSpace(a.teamId) || a.createdAt.localeCompare(b.createdAt));
}
