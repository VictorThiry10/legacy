import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRound, revealRound, maxBid, yearsLeft, DEFAULT_SETTINGS as S, drawLottery, lotteryOdds, fantasyPoints, scoreRows, rosterProblems, teamState, rankWaiverBids, slot, parseSchedule, DAILY, type Schedule, type TeamState, type Bid } from "./rules";

const M = 1_000_000;
const team = (id: string, salary = 0, rosterCount = 0): TeamState => ({ id, salary, rosterCount, slotsUsed: {} });
let n = 0;
const bid = (teamId: string, playerId: string, amount: number, years = 1, t = n++): Bid => ({
  id: `b${n}`, teamId, playerId, amount: amount * M, years, createdAt: new Date(1e12 + t * 1000).toISOString(),
});

test("highest bid wins", () => {
  const r = resolveRound(["p1"], [bid("A", "p1", 10), bid("B", "p1", 12)], [team("A"), team("B")]);
  assert.equal(r.awards[0].teamId, "B");
  assert.equal(r.awards[0].amount, 12 * M);
});

test("tie goes to most cap space", () => {
  const r = resolveRound(["p1"], [bid("A", "p1", 10), bid("B", "p1", 10)], [team("A", 20 * M), team("B", 5 * M)]);
  assert.equal(r.awards[0].teamId, "B");
  assert.equal(r.awards[0].tie, "cap");
});

test("double tie: the computer picks, the same way every time for a round", () => {
  const bids = [bid("A", "p1", 10), bid("B", "p1", 10)];
  const winners = new Set<string>();
  for (const seed of ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"]) {
    const r = resolveRound(["p1"], bids, [team("A"), team("B")], S, new Set(), seed);
    assert.equal(r.awards[0].tie, "random");
    assert.equal(resolveRound(["p1"], bids, [team("A"), team("B")], S, new Set(), seed).awards[0].teamId, r.awards[0].teamId);
    winners.add(r.awards[0].teamId);
  }
  assert.equal(winners.size, 2); // both teams win some seeds
});

test("over cap: most recent win goes to second highest bidder", () => {
  // A has 100m committed, 0 players. Wins p1 (30m, earlier) and p2 (25m, later): 155m > cap.
  const bids = [bid("A", "p1", 30), bid("A", "p2", 25), bid("B", "p2", 20)];
  const r = resolveRound(["p1", "p2"], bids, [team("A", 100 * M), team("B")]);
  const p2 = r.awards.find((a) => a.playerId === "p2")!;
  assert.equal(p2.teamId, "B");
  assert.equal(r.voided[0].reason, "over_cap");
});

test("must keep $1m per open roster spot", () => {
  // 13 spots. A has 0 players, bids 139m: 139 + 12 open spots * 1m = 151 > 150
  const r = resolveRound(["p1"], [bid("A", "p1", 139)], [team("A")]);
  assert.equal(r.awards.length, 0);
  assert.deepEqual(r.unsold, ["p1"]);
  const ok = resolveRound(["p1"], [bid("A", "p1", 138)], [team("A")]);
  assert.equal(ok.awards.length, 1);
});

test("contract slot limit: only one 4 year deal", () => {
  const bids = [bid("A", "p1", 10, 4), bid("A", "p2", 10, 4), bid("B", "p2", 5, 2)];
  const r = resolveRound(["p1", "p2"], bids, [team("A"), team("B")]);
  assert.equal(r.awards.find((a) => a.playerId === "p2")!.teamId, "B");
});

test("renounced bid passes player to next bidder", () => {
  const b1 = bid("A", "p1", 10), b2 = bid("B", "p1", 8);
  const r = resolveRound(["p1"], [b1, b2], [team("A"), team("B")], S, new Set([b1.id]));
  assert.equal(r.awards[0].teamId, "B");
});

test("max bid keeps $1m per empty roster spot, zero when the roster is full", () => {
  assert.equal(maxBid(team("A", 100 * M, 5), S), 150 * M - 100 * M - 7 * M);
  assert.equal(maxBid(team("A", 0, 12), S), 150 * M);
  assert.equal(maxBid(team("A", 0, 13), S), 0);
});

test("reveal lists every bid with what happened to it", () => {
  const b1 = bid("A", "p1", 12), b2 = bid("B", "p1", 10), b3 = bid("C", "p1", 8);
  const { items, awards } = revealRound(["p1", "p2"], [b1, b2, b3], [team("A"), team("B"), team("C")], S, new Set([b1.id]), "r");
  assert.deepEqual(items[0].bids.map((b) => b.status), ["renounced", "won", "lost"]);
  assert.equal(awards[0].teamId, "B");
  assert.equal(items[1].winner, null);
});

test("years left on a contract", () => {
  assert.equal(yearsLeft({ season_signed: 2025, years: 4 }, 2026), 3);
  assert.equal(yearsLeft({ season_signed: 2026, years: 1 }, 2026), 1);
});

test("lottery odds match the deck and sum to 100", () => {
  const ids = ["w1", "w2", "w3", "w4", "t1", "t2", "t3", "t4"];
  const o = lotteryOdds(ids);
  assert.deepEqual([o.w1, o.w2, o.w3, o.w4, o.t1], [25, 20, 15, 10, 7.5]);
  assert.equal(Object.values(o).reduce((a, b) => a + b, 0), 100);
  const counts: Record<string, number> = {};
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20000; i++) {
    const first = drawLottery(ids, rand).order[0];
    counts[first] = (counts[first] ?? 0) + 1;
  }
  assert.ok(Math.abs(counts.w1 / 20000 - 0.25) < 0.02);
  assert.ok(Math.abs(counts.t4 / 20000 - 0.075) < 0.01);
});

test("lottery draws every pick: each one among the teams left, by their odds", () => {
  const ids = ["w1", "w2", "w3", "w4", "t1", "t2", "t3", "t4"];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const last: Record<string, number> = {};
  const second: Record<string, number> = {}; // who picks 2nd when w1 picks 1st
  let w1First = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const { order, combos } = drawLottery(ids, rand);
    assert.deepEqual([...order].sort(), [...ids].sort()); // every team once
    assert.equal(combos.length, 7); // the last team left isn't drawn
    for (const c of combos) {
      assert.equal(new Set(c).size, 4);
      assert.ok(c.every((n) => n >= 1 && n <= 14));
    }
    last[order[7]] = (last[order[7]] ?? 0) + 1;
    if (order[0] === "w1") {
      w1First++;
      second[order[1]] = (second[order[1]] ?? 0) + 1;
    }
  }
  // the bottom picks aren't set by record: the worst team can fall to last, and does so less often than a top team
  assert.ok(last.w1 > 0 && last.w1 < last.t4);
  // with w1 gone, w2 has 20 of the 75 points left
  assert.ok(Math.abs(second.w2 / w1First - 20 / 75) < 0.02);
  assert.ok(Math.abs(second.t1 / w1First - 7.5 / 75) < 0.02);
});

test("lottery takes other odds, and a team with none is never drawn", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const odds = { a: 50, b: 30, c: 10, d: 10, e: 0 };
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let first = 0;
  for (let i = 0; i < 4000; i++) {
    const { order } = drawLottery(ids, rand, odds);
    assert.equal(order[4], "e");
    if (order[0] === "a") first++;
  }
  assert.ok(Math.abs(first / 4000 - 0.5) < 0.03);
});

test("fantasy points", () => {
  // 20 pts, 8-15 FG, 10 reb, 5 ast, 2 stl, 1 blk, 3 to, 0 tf, 0 ej, win
  const p = fantasyPoints({ pts: 20, fgm: 8, fga: 15, reb: 10, ast: 5, stl: 2, blk: 1, to: 3, tf: 0, ej: 0, win: 1 });
  // 20 + 8 - 7 + 10 + 7.5 + 5 + 2.5 - 4.5 + 1 = 42.5
  assert.equal(p, 42.5);
});

test("custom scoring weights", () => {
  const line = { pts: 10, fgm: 4, fga: 8, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, tf: 0, ej: 0, win: 0 };
  assert.equal(fantasyPoints(line, { pts: 2, fgm: 0, fgmi: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, tf: 0, ej: 0, win: 0 }), 20);
});

test("roster problems: cap, roster size, contract slots", () => {
  const ok: TeamState = { id: "a", salary: 150_000_000, rosterCount: 13, slotsUsed: { 4: 1 } };
  assert.deepEqual(rosterProblems(ok, S), []);
  const bad: TeamState = { id: "a", salary: 151_000_000, rosterCount: 14, slotsUsed: { 4: 2 } };
  const p = rosterProblems(bad, S);
  assert.equal(p.length, 3);
  assert.match(p[0], /over the \$150m cap by \$1m/);
});

test("team state: every contract counts against the cap, IR doesn't take a roster spot", () => {
  const c = (player_id: string, salary: number, season_signed = 2025) => ({ player_id, salary, years: 2, season_signed, active: true });
  const t = teamState("a", [c("p1", 10_000_000), c("p2", 5_000_000, 2026), { ...c("p3", 3_000_000), active: false }], 1_000_000, 2026, new Set(["p2"]));
  assert.equal(t.salary, 16_000_000); // released p3 doesn't count, the $1m adjustment does
  assert.equal(t.rosterCount, 1); // p2 is on IR
  assert.deepEqual(t.slotsUsed, { 2: 1 }); // only this season's signing uses a slot
});

test("waivers: highest sealed bid first, ties to more cap space, then the earlier bid", () => {
  const space: Record<string, number> = { A: 10 * M, B: 30 * M, C: 30 * M };
  const w = (id: string, teamId: string, amount: number, createdAt: string) => ({ id, teamId, amount: amount * M, createdAt });
  const ranked = rankWaiverBids(
    [w("1", "A", 5, "2026-10-01T10:00"), w("2", "B", 5, "2026-10-01T12:00"), w("3", "C", 5, "2026-10-01T11:00"), w("4", "A", 7, "2026-10-01T13:00")],
    (t) => space[t],
    S.minSalary,
  );
  assert.deepEqual(ranked.map((b) => b.id), ["4", "3", "2", "1"]);
});

test("waivers: bids under the minimum salary don't count", () => {
  const ranked = rankWaiverBids([{ id: "1", teamId: "A", amount: 500_000, createdAt: "" }], () => 0, S.minSalary);
  assert.equal(ranked.length, 0);
});

test("scoreRows: one row per category that happened, adding up to the fantasy points", () => {
  // Ace Bailey's line in ESPN's pop-up: 2 points, 2 assists, 4 rebounds, 1 turnover, 1 of 5 shooting
  const line = { pts: 2, fgm: 1, fga: 5, reb: 4, ast: 2, stl: 0, blk: 0, to: 1, tf: 0, ej: 0, win: 0 };
  const w = { pts: 1, fgm: 1, fgmi: -1, reb: 1, ast: 1.5, stl: 2.5, blk: 2.5, to: -2, tf: -1, ej: -2, win: 0 };
  const rows = scoreRows(line, w);
  assert.deepEqual(rows.map((r) => [r.label, r.per, r.n, r.score]), [
    ["Points", 1, 2, 2], ["Assists", 1.5, 2, 3], ["Rebounds", 1, 4, 4], ["Turnovers", -2, 1, -2],
    ["Field Goals Made", 1, 1, 1], ["Field Goals Missed", -1, 4, -4],
  ]);
  assert.equal(rows.reduce((a, r) => a + r.score, 0), fantasyPoints(line, w));
});

test("free agency schedule: a round a day, 8:00 to 18:00, renounce until 19:00", () => {
  const s: Schedule = { start: "2026-10-12T07:00:00.000Z", from: 0, ...DAILY };
  const at = (opened: number) => {
    const t = slot(s, opened);
    return [t.opens, t.closes, t.settles].map((x) => new Date(x).toISOString());
  };
  assert.deepEqual(at(0), ["2026-10-12T07:00:00.000Z", "2026-10-12T17:00:00.000Z", "2026-10-12T18:00:00.000Z"]);
  assert.deepEqual(at(6), ["2026-10-18T07:00:00.000Z", "2026-10-18T17:00:00.000Z", "2026-10-18T18:00:00.000Z"]); // round 7
  assert.equal(at(7)[0], "2026-10-19T07:00:00.000Z"); // the last chance round, the day after
});

test("free agency schedule set again halfway: the start is the next round to open", () => {
  const s: Schedule = { start: "2026-10-15T07:00:00.000Z", from: 3, ...DAILY }; // three rounds already opened
  assert.equal(new Date(slot(s, 3).opens).toISOString(), "2026-10-15T07:00:00.000Z");
  assert.equal(new Date(slot(s, 4).opens).toISOString(), "2026-10-16T07:00:00.000Z");
});

test("a stored schedule is checked: bidding and the renounce window must fit before the next round", () => {
  assert.equal(parseSchedule(null), null);
  assert.equal(parseSchedule({ start: "nope", from: 0, ...DAILY }), null);
  assert.equal(parseSchedule({ start: "2026-10-12T07:00:00.000Z", from: 0, bidMinutes: 600, renounceMinutes: 120, everyMinutes: 600 }), null);
  assert.ok(parseSchedule({ start: "2026-10-12T07:00:00.000Z", from: 0, ...DAILY }));
});
