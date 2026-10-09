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
  tie?: "cap" | "random"; // how a tied top bid was settled: more cap space, or (also tied on space) by the computer
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

// The most a team can bid on one player: its cap space, keeping the minimum salary for every roster spot
// still empty after this signing. A full roster can't bid.
export function maxBid(t: TeamState, s: Settings) {
  if (t.rosterCount >= s.rosterMax) return 0;
  return Math.max(0, s.cap - t.salary - (s.rosterMax - t.rosterCount - 1) * s.minSalary);
}

// FNV-1a: a stable "random" number from a string, so a computer pick is the same on every screen and every reload.
const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

// Best bid first: highest amount, then most cap space, then the computer's random pick (seeded by the round).
export function rankBids(bids: Bid[], space: (teamId: string) => number, seed = ""): Bid[] {
  return [...bids].sort((a, b) => b.amount - a.amount || space(b.teamId) - space(a.teamId) || hash(seed + a.id) - hash(seed + b.id));
}

/**
 * Resolve a sealed bid round.
 * 1. Each player goes to the highest bid. Ties: most cap space wins; if still tied, the computer picks at random.
 * 2. If a team ends up illegal (over cap, roster full, no contract slot), its most recent winning bid
 *    is voided and that player goes to the next highest bidder. Repeat until everyone is legal.
 * `excluded` holds bid ids to ignore (renounced bids). `seed` (the round id) fixes the random picks.
 */
export function resolveRound(
  playerIds: string[],
  bids: Bid[],
  teams: TeamState[],
  s: Settings = DEFAULT_SETTINGS,
  excluded: Set<string> = new Set(),
  seed = "",
): Resolution {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const voided: Resolution["voided"] = [];
  const dead = new Set(excluded);
  const space = (id: string) => capSpace(teamById.get(id)!, s);

  const ranked = (pid: string) =>
    rankBids(bids.filter((b) => b.playerId === pid && !dead.has(b.id) && teamById.has(b.teamId) && b.amount >= s.minSalary), space, seed);

  for (let guard = 0; guard < 1000; guard++) {
    // tentative awards
    const awards: Award[] = [];
    for (const pid of playerIds) {
      const list = ranked(pid);
      if (!list.length) continue;
      const [top, second] = list;
      const tie = second?.amount === top.amount ? (space(second.teamId) === space(top.teamId) ? "random" : "cap") : undefined;
      awards.push({ playerId: pid, teamId: top.teamId, amount: top.amount, years: top.years, bidId: top.id, ...(tie && { tie }) });
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

// Free agency bids are in whole millions.
export const BID_STEP = 1_000_000;

// Free agency runs by the clock, a round a day: bidding opens, the results come out when it closes, winners can
// renounce for a while, then they sign. `start` is when the round after `from` others have opened opens (so the
// schedule can be set again halfway through); the next ones follow every `everyMinutes`.
export type Schedule = { start: string; from: number; bidMinutes: number; renounceMinutes: number; everyMinutes: number };

// The league's plan: 8:00 to 18:00 bidding, an hour to renounce, every day.
export const DAILY = { bidMinutes: 600, renounceMinutes: 60, everyMinutes: 1440 } as const;

// When the round that opens after `opened` others opens, closes (results) and settles (winners sign), in ms.
export function slot(s: Schedule, opened: number) {
  const opens = Date.parse(s.start) + (opened - s.from) * s.everyMinutes * 60_000;
  const closes = opens + s.bidMinutes * 60_000;
  return { opens, closes, settles: closes + s.renounceMinutes * 60_000 };
}

// A schedule as stored (settings.fa_schedule), or null if it's missing or broken.
export function parseSchedule(x: unknown): Schedule | null {
  const s = x as Partial<Schedule> | null;
  const ok = (n: unknown, min: number) => typeof n === "number" && Number.isFinite(n) && n >= min;
  if (!s || typeof s.start !== "string" || Number.isNaN(Date.parse(s.start))) return null;
  if (!ok(s.from, 0) || !ok(s.bidMinutes, 1) || !ok(s.renounceMinutes, 0) || !ok(s.everyMinutes, 1)) return null;
  if (s.bidMinutes! + s.renounceMinutes! > s.everyMinutes!) return null; // a round must be over before the next opens
  return s as Schedule;
}

// No drop-and-rebuy: a GM who drops a player from this moment on can't bid on him in the auction (Victor, 2026-10-09).
export const NO_REBUY_FROM = "2026-10-09T00:00:00Z";

// Renounce Rights: each GM can give up one signing per season (Victor, 2026-10-09: "just 1 renounce per GM"). The player goes to the next bidder.
export const RENOUNCE_RIGHTS = 1;

export type BidStatus = "won" | "lost" | "voided" | "renounced";
export type RevealItem = {
  playerId: string;
  winner: Award | null;
  bids: { bidId: string; teamId: string; amount: number; status: BidStatus; reason?: string }[]; // best first
};

// The round as everyone sees it after bidding closes: for each player, who signed him and every other bid.
export function revealRound(
  playerIds: string[],
  bids: Bid[],
  teams: TeamState[],
  s: Settings,
  renounced: Set<string>,
  seed: string,
): { items: RevealItem[]; awards: Award[] } {
  const r = resolveRound(playerIds, bids, teams, s, renounced, seed);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const space = (id: string) => (teamById.has(id) ? capSpace(teamById.get(id)!, s) : 0);
  const won = new Map(r.awards.map((a) => [a.playerId, a]));
  const voided = new Map(r.voided.map((v) => [v.bidId, v.reason]));
  const items = playerIds.map((pid) => ({
    playerId: pid,
    winner: won.get(pid) ?? null,
    bids: rankBids(bids.filter((b) => b.playerId === pid), space, seed).map((b) => ({
      bidId: b.id,
      teamId: b.teamId,
      amount: b.amount,
      status: (won.get(pid)?.bidId === b.id ? "won" : renounced.has(b.id) ? "renounced" : voided.has(b.id) ? "voided" : "lost") as BidStatus,
      ...(voided.has(b.id) && { reason: voided.get(b.id) }),
    })),
  }));
  return { items, awards: r.awards };
}

// Seasons left on a contract, counting this one: signed in 2025 for 4 years is 3 left in 2026.
export const yearsLeft = (c: { season_signed: number; years: number }, season: number) => Math.max(0, c.season_signed + c.years - season);

// Rookie lottery odds for the #1 pick. Input: team ids ordered worst to best.
export function lotteryOdds(worstToBest: string[]): Record<string, number> {
  const bottom = [25, 20, 15, 10];
  const odds: Record<string, number> = {};
  const n = worstToBest.length;
  const topShare = n > 4 ? (100 - bottom.reduce((a, b) => a + b, 0)) / (n - 4) : 0;
  worstToBest.forEach((id, i) => (odds[id] = i < 4 ? bottom[i] : topShare));
  return odds;
}

// The draw uses the NBA's machine: 14 numbered balls, 4 drawn, so 1,001 possible combinations, 1,000 of them handed
// out by odds (25% is 250 combinations; one belongs to nobody). Unlike the NBA, every pick is drawn, #1 first:
// a combination that is nobody's, or belongs to a team already drawn, is drawn again, so each pick goes to one of
// the teams still left, by their odds. The last team left takes the last pick.
export const LOTTERY_BALLS = 14;

export type Lottery = { order: string[]; combos: number[][] }; // combos[k]: the four balls that won pick k + 1, as drawn (none for the last team left)

// Who owns each combination ("3-7-9-12" -> index of the team). The same table every time: the combinations are
// shuffled with a fixed seed, then dealt out, so a team's share is spread over all the balls.
const tables = new Map<string, Map<string, number>>();
function lotteryTable(counts: number[]): Map<string, number> {
  const key = counts.join();
  const known = tables.get(key);
  if (known) return known;
  const all: string[] = [];
  const N = LOTTERY_BALLS;
  for (let a = 1; a <= N; a++) for (let b = a + 1; b <= N; b++) for (let c = b + 1; c <= N; c++) for (let d = c + 1; d <= N; d++) all.push(`${a}-${b}-${c}-${d}`);
  all.pop(); // 11-12-13-14 is nobody's
  let seed = 2026;
  for (let i = all.length - 1; i > 0; i--) {
    seed = (seed * 16807) % 2147483647;
    const j = seed % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  const table = new Map<string, number>();
  let next = 0;
  counts.forEach((n, team) => {
    for (let k = 0; k < n && next < all.length; k++) table.set(all[next++], team);
  });
  tables.set(key, table);
  return table;
}

// Draw the lottery. `odds` are % chances at the #1 pick per team (the league's by default).
export function drawLottery(worstToBest: string[], rand: () => number = Math.random, odds: Record<string, number> = lotteryOdds(worstToBest)): Lottery {
  const counts = worstToBest.map((id) => Math.round((odds[id] ?? 0) * 10));
  const owner = lotteryTable(counts);
  const inPlay = counts.filter((n) => n > 0).length;
  const picks = inPlay === worstToBest.length ? inPlay - 1 : inPlay; // the last team left needs no draw
  const top: string[] = [];
  const combos: number[][] = [];
  while (top.length < picks) {
    const balls = Array.from({ length: LOTTERY_BALLS }, (_, i) => i + 1);
    const drawn = Array.from({ length: 4 }, () => balls.splice(Math.floor(rand() * balls.length), 1)[0]);
    const team = worstToBest[owner.get([...drawn].sort((a, b) => a - b).join("-")) ?? -1];
    if (!team || top.includes(team)) continue;
    top.push(team);
    combos.push(drawn);
  }
  return { order: [...top, ...worstToBest.filter((id) => !top.includes(id))], combos };
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

// The same sum, category by category, for the scoring pop-up: how many of each, what one is worth, what they add
// up to. In ESPN's order; categories with none are left out.
const ROW_ORDER: (keyof Scoring)[] = ["pts", "ast", "reb", "stl", "blk", "to", "fgm", "fgmi", "tf", "ej", "win"];
export const SCORING_LABELS: Record<keyof Scoring, string> = {
  pts: "Points", ast: "Assists", reb: "Rebounds", stl: "Steals", blk: "Blocks", to: "Turnovers",
  fgm: "Field Goals Made", fgmi: "Field Goals Missed", tf: "Technical Fouls", ej: "Ejections", win: "Team Win",
};
export function scoreRows(l: StatLine, w: Scoring = SCORING) {
  const n: Record<keyof Scoring, number> = { ...l, fgmi: l.fga - l.fgm };
  return ROW_ORDER.filter((k) => n[k]).map((k) => ({ key: k, label: SCORING_LABELS[k], per: w[k], n: n[k], score: Math.round(n[k] * w[k] * 10) / 10 }));
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
